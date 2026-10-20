import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import FinancialTransaction from "@/models/FinancialTransaction";
import User from "@/models/User";
import WalletBalance from "@/models/WalletBalance";
import WalletTransaction from "@/models/WalletTransaction";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getWalletBalanceSnapshot } from "@/lib/wallet-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { userId, amountMinor, direction, reason, idempotencyKey } = parsed.body;
  if (
    typeof userId !== "string" ||
    !mongoose.isValidObjectId(userId) ||
    new mongoose.Types.ObjectId(userId).toString() !== userId ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 1 ||
    amountMinor > 100000000 ||
    !["credit", "debit"].includes(direction) ||
    typeof reason !== "string" ||
    reason.trim().length < 3 ||
    reason.trim().length > 240 ||
    typeof idempotencyKey !== "string" ||
    !/^[a-zA-Z0-9-]{16,100}$/.test(idempotencyKey)
  ) {
    return NextResponse.json({ error: "Enter a valid account, amount, direction, reason, and request key." }, { status: 400 });
  }
  const auth = await requireAdmin(request, "superAdmin");
  if (auth.response) return auth.response;
  const rate = await consumeRateLimit(request, "admin-wallet-adjustment", { limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many balance adjustments. Try again later." }, { status: 429 });

  const session = await mongoose.startSession();
  try {
    let updatedBalance;
    await session.withTransaction(async () => {
      const user = await User.findOne({
        _id: userId,
        role: { $in: ["user", "helpAdmin", "moderator"] },
        active: true,
        deletedAt: null,
      }).select("_id name");
      if (!user) {
        const error = new Error("The account is missing, disabled, or deleted.");
        error.statusCode = 404;
        throw error;
      }
      await WalletBalance.updateOne(
        { userId: user._id },
        { $setOnInsert: { balanceMinor: 0, currency: "PKR" } },
        { upsert: true, session },
      );
      const filter = { userId: user._id };
      filter.balanceMinor = direction === "debit"
        ? { $gte: amountMinor }
        : { $lte: Number.MAX_SAFE_INTEGER - amountMinor };
      const balance = await WalletBalance.findOneAndUpdate(
        filter,
        { $inc: { balanceMinor: direction === "credit" ? amountMinor : -amountMinor } },
        { new: true, session },
      );
      if (!balance) {
        const error = new Error("The account does not have enough available balance for this debit.");
        error.statusCode = 409;
        throw error;
      }
      const description = `Admin ${direction}: ${reason.trim()}`;
      const [transaction] = await WalletTransaction.create(
        [{
          userId: user._id,
          type: "adjustment",
          direction,
          amountMinor,
          status: "completed",
          idempotencyKey: `admin-adjustment:${idempotencyKey}`,
          description,
          createdBy: auth.user._id,
          ...getWalletBalanceSnapshot(balance, "earning", direction, amountMinor),
        }],
        { session },
      );
      await FinancialTransaction.create(
        [{
          type: "adjustment",
          amountMinor,
          status: "completed",
          referenceId: transaction._id,
          userId: user._id,
          idempotencyKey: `admin-adjustment-finance:${idempotencyKey}`,
          description,
          createdBy: auth.user._id,
        }],
        { session },
      );
      await writeAdminAudit(request, auth, `wallet.${direction}-adjustment`, {
        type: "User",
        id: user._id.toString(),
        metadata: { amountMinor, reason: reason.trim(), balanceAfterMinor: balance.balanceMinor },
        session,
      });
      await createNotification(
        {
          userId: user._id,
          type: "wallet",
          title: "Wallet balance updated",
          message: `An administrator ${direction === "credit" ? "credited" : "debited"} ${amountMinor} paisa. Reason: ${reason.trim()}`,
        },
        session,
      );
      updatedBalance = balance.balanceMinor;
    });
    return NextResponse.json({ message: "Wallet balance adjusted and recorded.", balanceMinor: updatedBalance });
  } catch (error) {
    if (error.code === 11000) {
      return NextResponse.json({ error: "This adjustment request was already processed." }, { status: 409 });
    }
    if (error.statusCode) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Admin wallet adjustment failed:", error);
    return NextResponse.json({ error: "Could not adjust this wallet balance." }, { status: 500 });
  } finally {
    await session.endSession();
  }
}
