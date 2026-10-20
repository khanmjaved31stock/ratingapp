import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { decryptJson } from "@/lib/encryption";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import FinancialTransaction from "@/models/FinancialTransaction";
import WalletBalance from "@/models/WalletBalance";
import WalletTransaction from "@/models/WalletTransaction";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import User from "@/models/User";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";
import { getWalletBalanceSnapshot } from "@/lib/wallet-ledger";
import { maskPayoutDetails } from "@/lib/payout-details";
import { getWithdrawalStatusFilter } from "@/lib/withdrawal-methods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDate(value, endOfDay = false) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value) ? date : undefined;
}

export async function GET(request) {
  try {
    const auth = await requireStaff(request, ["superAdmin", "helpAdmin"]);
    if (auth.response) return auth.response;
    const revealId = new URL(request.url).searchParams.get("revealId");
    if (revealId) {
      if (!mongoose.isValidObjectId(revealId) || new mongoose.Types.ObjectId(revealId).toString() !== revealId) {
        return NextResponse.json({ error: "Invalid withdrawal identifier." }, { status: 400 });
      }
      const rate = await consumeRateLimit(request, "admin-withdrawal-details", {
        limit: 20,
        windowMs: 60 * 60 * 1000,
      });
      if (!rate.allowed) {
        return NextResponse.json({ error: "Too many payout detail reveals. Try again later." }, { status: 429 });
      }
      const withdrawal = await WithdrawalRequest.findOne({
        _id: revealId,
        status: { $in: ["pending", "processing"] },
      }).select("+encryptedPayoutDetails");
      if (!withdrawal) return NextResponse.json({ error: "Open withdrawal not found." }, { status: 404 });
      const payoutDetails = decryptJson(withdrawal.encryptedPayoutDetails);
      await writeAdminAudit(request, auth, "withdrawal.details-revealed", {
        type: "WithdrawalRequest",
        id: revealId,
        metadata: { provider: withdrawal.provider, status: withdrawal.status },
      });
      return NextResponse.json(
        { payoutDetails },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const rate = await consumeRateLimit(request, "admin-withdrawal-review", {
      limit: 300,
      windowMs: 60 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many payout review actions. Please try again later." }, { status: 429 });
    }
    const params = new URL(request.url).searchParams;
    const pageValue = Number(params.get("page") || 1);
    const limitValue = Number(params.get("limit") || 25);
    const status = params.get("status") || "all";
    const provider = params.get("provider") || "";
    const query = (params.get("q") || "").trim().slice(0, 120);
    const from = parseDate(params.get("from"));
    const to = parseDate(params.get("to"), true);
    const providers = ["easypaisa", "jazzcash", "bank", "usdtBep20", "usdtTrc20"];
    if (
      !Number.isInteger(pageValue) || pageValue < 1 ||
      !Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100 ||
      !["all", "pending", "processing", "paid", "rejected"].includes(status) ||
      (provider && !providers.includes(provider)) ||
      from === undefined || to === undefined ||
      (from && to && from > to)
    ) {
      return NextResponse.json({ error: "Invalid withdrawal filters." }, { status: 400 });
    }
    const filter = {};
    if (status !== "all") filter.status = status;
    if (provider) filter.provider = provider;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }
    if (query) {
      const safeQuery = escapeRegex(query);
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: safeQuery, $options: "i" } },
          { email: { $regex: safeQuery, $options: "i" } },
        ],
      }).select("_id").limit(100).lean();
      const anyOf = [
        { payoutReference: { $regex: safeQuery, $options: "i" } },
        { userId: { $in: matchingUsers.map((user) => user._id) } },
      ];
      if (mongoose.isValidObjectId(query)) {
        anyOf.push({ _id: query }, { userId: query });
      }
      filter.$or = anyOf;
    }
    const [total, withdrawals] = await Promise.all([
      WithdrawalRequest.countDocuments(filter),
      WithdrawalRequest.find(filter)
        .select("+encryptedPayoutDetails")
        .populate("userId", "name email")
        .populate("reviewedBy", "name email")
        .sort({ createdAt: -1 })
        .skip((pageValue - 1) * limitValue)
        .limit(limitValue)
        .lean(),
    ]);
    return NextResponse.json({
      page: pageValue,
      limit: limitValue,
      total,
      pages: Math.ceil(total / limitValue),
      withdrawals: withdrawals.map((item) => ({
        id: item._id.toString(),
        user: item.userId
          ? { id: item.userId._id.toString(), name: item.userId.name, email: item.userId.email }
          : null,
        amountMinor: item.amountMinor,
        currency: item.currency,
        provider: item.provider,
        payoutDetails: maskPayoutDetails(
          item.encryptedPayoutDetails
            ? decryptJson(item.encryptedPayoutDetails)
            : {},
        ),
        status: item.status,
        reviewNote: item.reviewNote,
        payoutReference: item.payoutReference,
        reviewedAt: item.reviewedAt?.toISOString() || null,
        reviewedBy: item.reviewedBy
          ? { id: item.reviewedBy._id.toString(), name: item.reviewedBy.name, email: item.reviewedBy.email }
          : null,
        createdAt: item.createdAt.toISOString(),
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Loading withdrawal queue failed:", error);
    return NextResponse.json({ error: "Could not load withdrawals." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { id, decision, reviewNote, payoutReference } = parsed.body;
  if (
    typeof id !== "string" ||
    !mongoose.isValidObjectId(id) ||
    new mongoose.Types.ObjectId(id).toString() !== id ||
    !["processing", "paid", "rejected"].includes(decision) ||
    (reviewNote !== undefined &&
      (typeof reviewNote !== "string" || reviewNote.length > 500)) ||
    (payoutReference !== undefined &&
      (typeof payoutReference !== "string" || payoutReference.length > 120)) ||
    (decision === "rejected" && (typeof reviewNote !== "string" || !reviewNote.trim()))
  ) {
    return NextResponse.json({ error: "Invalid withdrawal review action." }, { status: 400 });
  }
  const auth = await requireStaff(request, ["superAdmin", "helpAdmin"]);
  if (auth.response) return auth.response;
  const allowedStatuses = getWithdrawalStatusFilter(decision);
  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      const withdrawal = await WithdrawalRequest.findOneAndUpdate(
        {
          _id: id,
          status: { $in: allowedStatuses },
        },
        {
          $set: {
            status: decision,
            reviewedBy: auth.user._id,
            reviewedAt: new Date(),
            reviewNote: reviewNote?.trim() || "",
            payoutReference: payoutReference?.trim() || "",
          },
        },
        { new: true, session: dbSession },
      );
      if (!withdrawal) {
        const error = new Error("Withdrawal is not awaiting review.");
        error.statusCode = 409;
        throw error;
      }

      const ledger = await WalletTransaction.findOne({
        referenceId: withdrawal._id,
        type: "withdrawal",
      }).session(dbSession);
      if (!ledger) {
        throw new Error("Withdrawal ledger entry is missing; manual reconciliation is required.");
      }

      if (decision === "rejected") {
        const balance = await WalletBalance.findOneAndUpdate(
          {
            userId: withdrawal.userId,
            balanceMinor: { $lte: Number.MAX_SAFE_INTEGER - withdrawal.amountMinor },
          },
          { $inc: { balanceMinor: withdrawal.amountMinor } },
          { new: true, session: dbSession },
        );
        if (!balance) throw new Error("Could not release the reserved withdrawal balance; manual reconciliation is required.");
        await WalletTransaction.create(
          [{
            userId: withdrawal.userId,
            type: "withdrawal",
            direction: "credit",
            amountMinor: withdrawal.amountMinor,
            currency: withdrawal.currency,
            status: "completed",
            referenceId: withdrawal._id,
            reversalOf: ledger._id,
            idempotencyKey: `withdrawal-reversal:${withdrawal._id.toString()}`,
            description: `Refund for rejected withdrawal: ${reviewNote?.trim() || "No reason provided"}`,
            createdBy: auth.user._id,
            ...getWalletBalanceSnapshot(balance, "earning", "credit", withdrawal.amountMinor),
          }],
          { session: dbSession },
        );
      } else if (decision === "paid") {
        await FinancialTransaction.create(
          [
            {
              type: "payout",
              amountMinor: withdrawal.payoutMinor || withdrawal.amountMinor,
              currency: withdrawal.currency,
              status: "completed",
              referenceId: withdrawal._id,
              idempotencyKey: `payout:${withdrawal._id.toString()}`,
              description: "User wallet withdrawal payout after processing fee",
              createdBy: auth.user._id,
            },
          ],
          { session: dbSession },
        );
        if (withdrawal.feeMinor > 0) {
          await FinancialTransaction.create(
            [
              {
                type: "withdrawalFee",
                amountMinor: withdrawal.feeMinor,
                currency: withdrawal.currency,
                status: "completed",
                referenceId: withdrawal._id,
                idempotencyKey: `withdrawal-fee:${withdrawal._id.toString()}`,
                description: "Withdrawal processing fee",
                createdBy: auth.user._id,
              },
            ],
            { session: dbSession },
          );
        }
      }
      await createNotification(
        {
          userId: withdrawal.userId,
          type: "withdrawal",
          title: decision === "paid" ? "Withdrawal paid" : decision === "rejected" ? "Withdrawal rejected" : "Withdrawal update",
          message: decision === "paid"
            ? `Your withdrawal of ${withdrawal.payoutMinor || withdrawal.amountMinor} paisa has been marked paid.`
            : decision === "rejected"
              ? `Your withdrawal was rejected. ${reviewNote?.trim() || "The reserved balance has been returned to your wallet."}`
              : "Your withdrawal request is being processed.",
        },
        dbSession,
      );

      await writeAdminAudit(request, auth, `withdrawal.${decision}`, {
        type: "WithdrawalRequest",
        id,
        metadata: {
          amountMinor: withdrawal.amountMinor,
          currency: withdrawal.currency,
          payoutReference: withdrawal.payoutReference,
          hasReviewNote: Boolean(withdrawal.reviewNote),
        },
        session: dbSession,
      });
    });
    return NextResponse.json({ message: `Withdrawal marked ${decision}.` });
  } catch (error) {
    if (error.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Updating withdrawal failed:", error);
    return NextResponse.json({ error: "Could not update withdrawal." }, { status: 500 });
  } finally {
    await dbSession.endSession();
  }
}
