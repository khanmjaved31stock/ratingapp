import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import { consumeRateLimit } from "@/lib/rate-limit";
import { privateImageUrl } from "@/lib/cloudinary";
import { getRequestIp } from "@/lib/request-ip";
import DepositRequest from "@/models/DepositRequest";
import FinancialTransaction from "@/models/FinancialTransaction";
import WalletBalance from "@/models/WalletBalance";
import WalletTransaction from "@/models/WalletTransaction";
import { getWalletBalanceSnapshot } from "@/lib/wallet-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await requireStaff(request, ["superAdmin", "helpAdmin"]);
    if (auth.response) return auth.response;
    const deposits = await DepositRequest.find().populate("userId", "name email")
      .populate("paymentAccountId", "displayName provider accountTitle accountNumber")
      .populate("reviewedBy", "name email").sort({ status: 1, createdAt: -1 }).limit(100).lean();
    return NextResponse.json({
      deposits: deposits.map((item) => ({
        id: item._id.toString(),
        user: item.userId ? { id: item.userId._id.toString(), name: item.userId.name, email: item.userId.email } : null,
        amountMinor: item.amountMinor,
        transactionId: item.transactionId,
        senderName: item.senderName,
        senderAccountNumber: item.senderAccountNumber
          ? `${"•".repeat(Math.max(4, item.senderAccountNumber.length - 4))}${item.senderAccountNumber.slice(-4)}`
          : "",
        paymentAccount: item.paymentAccountId ? {
          displayName: item.paymentAccountId.displayName,
          accountTitle: item.paymentAccountId.accountTitle,
          accountNumber: item.paymentAccountId.accountNumber
            ? `${"•".repeat(Math.max(4, item.paymentAccountId.accountNumber.length - 4))}${item.paymentAccountId.accountNumber.slice(-4)}`
            : "",
        } : null,
        proofUrl: privateImageUrl(item.proofPublicId, Math.floor(Date.now() / 1000) + 300),
        submissionIpAddress: item.submissionIpAddress,
        status: item.status,
        reviewNote: item.reviewNote,
        reviewedBy: item.reviewedBy?.name || "",
        createdAt: item.createdAt.toISOString(),
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Loading deposit review queue failed:", error);
    return NextResponse.json({ error: "Could not load the deposit review queue." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { id, decision, reviewNote = "" } = parsed.body;
  if (typeof id !== "string" || !mongoose.isValidObjectId(id) ||
    new mongoose.Types.ObjectId(id).toString() !== id ||
    !["approved", "rejected"].includes(decision) ||
    typeof reviewNote !== "string" || reviewNote.length > 500) {
    return NextResponse.json({ error: "Invalid deposit review action." }, { status: 400 });
  }
  const actor = await requireStaff(request, ["superAdmin", "helpAdmin"]);
  if (actor.response) return actor.response;
  const rate = await consumeRateLimit(request, "admin-deposit-review", { limit: 50, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many deposit review actions. Try again later." }, { status: 429 });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const reviewedAt = new Date();
      const deposit = await DepositRequest.findOneAndUpdate(
        { _id: id, status: "pending" },
        { $set: { status: decision, reviewedBy: actor.user._id, reviewedAt, reviewNote: reviewNote.trim(), ...(decision === "approved" ? { approvalIpAddress: getRequestIp(request) || "" } : {}) } },
        { new: true, session },
      );
      if (!deposit) {
        const error = new Error("Deposit is no longer pending.");
        error.statusCode = 409;
        throw error;
      }
      if (decision === "approved") {
        const user = await WalletBalance.findOneAndUpdate(
          { userId: deposit.userId },
          { $inc: { depositBalanceMinor: deposit.amountMinor }, $setOnInsert: { currency: "PKR" } },
          { upsert: true, new: true, session },
        );
        if (!user) throw new Error("Could not credit the deposit wallet.");
        await WalletTransaction.create([{
          userId: deposit.userId,
          type: "depositCredit",
          wallet: "deposit",
          direction: "credit",
          amountMinor: deposit.amountMinor,
          status: "completed",
          referenceId: deposit._id,
          idempotencyKey: `deposit-credit:${deposit._id.toString()}`,
          description: "Verified manual deposit",
          createdBy: actor.user._id,
          ...getWalletBalanceSnapshot(user, "deposit", "credit", deposit.amountMinor),
        }], { session });
        await FinancialTransaction.create([{
          type: "deposit",
          amountMinor: deposit.amountMinor,
          currency: "PKR",
          status: "completed",
          referenceId: deposit._id,
          userId: deposit.userId,
          idempotencyKey: `deposit-financial:${deposit._id.toString()}`,
          description: `Approved deposit ${deposit.transactionId}`,
          createdBy: actor.user._id,
        }], { session });
      }
      await createNotification({
        userId: deposit.userId,
        type: "wallet",
        title: decision === "approved" ? "Deposit approved" : "Deposit rejected",
        message: decision === "approved"
          ? `${deposit.amountMinor} paisa was added to your Deposit Wallet.`
          : `Your deposit proof was rejected${reviewNote.trim() ? `: ${reviewNote.trim()}` : "."}`,
      }, session);
      await writeAdminAudit(request, actor, `deposit.${decision}`, {
        type: "DepositRequest",
        id: deposit._id.toString(),
        metadata: { userId: deposit.userId.toString(), amountMinor: deposit.amountMinor, transactionId: deposit.transactionId },
        session,
      });
    });
    return NextResponse.json({ message: `Deposit ${decision}.` });
  } catch (error) {
    if (error.statusCode) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Reviewing deposit failed:", error);
    return NextResponse.json({ error: "Could not update the deposit." }, { status: 500 });
  } finally {
    await session.endSession();
  }
}
