import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getActiveRequestUser } from "@/lib/request-auth";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import { decryptJson } from "@/lib/encryption";
import PortalSettings from "@/models/PortalSettings";
import WalletBalance from "@/models/WalletBalance";
import WalletTransaction from "@/models/WalletTransaction";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import ReviewTaskAssignment from "@/models/ReviewTaskAssignment";
import User from "@/models/User";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  calculateWithdrawalFee,
  getWithdrawalFeeBasisPoints,
  isValidWithdrawalPolicy,
} from "@/lib/withdrawal-fee";
import { getWalletBalanceSnapshot } from "@/lib/wallet-ledger";
import PackageHistory from "@/models/PackageHistory";
import { getBusinessDayRange } from "@/lib/business-time";
import { createNotification } from "@/lib/notifications";
import { maskPayoutDetails, normalizePayoutDetails } from "@/lib/payout-details";
import { currentTermsRequiredMessage, requiresCurrentTermsAcceptance } from "@/lib/legal-terms";
import { getConfiguredWithdrawalMethods } from "@/lib/withdrawal-methods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user" || auth.user.paymentStatus !== "approved") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const [wallet, transactions, withdrawals, payoutUser, settings, packageHistory] = await Promise.all([
      WalletBalance.findOne({ userId: auth.user._id }).lean(),
      WalletTransaction.find({ userId: auth.user._id })
        .sort({ _id: -1 })
        .limit(100)
        .lean(),
      WithdrawalRequest.find({ userId: auth.user._id })
        .select("+encryptedPayoutDetails")
        .sort({ _id: -1 })
        .limit(50)
        .lean(),
      User.findById(auth.user._id).select(
        "+payoutProfile.encryptedDetails payoutProfile.provider packageId packageName packageExpiresAt packageWithdrawalMinimumMinor packageWithdrawalMaximumMinor packageWithdrawalFeeBrackets",
      ),
      PortalSettings.findOne({ key: "global" })
        .select("businessTimeZone")
        .lean(),
      PackageHistory.find({ userId: auth.user._id }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    const businessDay = getBusinessDayRange(new Date(), settings?.businessTimeZone || "UTC");
    const withdrawalPolicy = {
      minimumWithdrawalMinor: payoutUser.packageWithdrawalMinimumMinor ?? 100,
      maximumWithdrawalMinor: payoutUser.packageWithdrawalMaximumMinor ?? null,
      withdrawalFeeBrackets: payoutUser.packageWithdrawalFeeBrackets || [
        { minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 },
      ],
    };
    if (!isValidWithdrawalPolicy(
      withdrawalPolicy.minimumWithdrawalMinor,
      withdrawalPolicy.maximumWithdrawalMinor,
      withdrawalPolicy.withdrawalFeeBrackets,
    )) {
      return NextResponse.json(
        { error: "Package withdrawal rules are unavailable. Contact support." },
        { status: 503 },
      );
    }
    const [withdrawn, dailyCollected, pendingTaskRewards, earnings, pendingWithdrawals] = await Promise.all([
      WithdrawalRequest.aggregate([
        { $match: { userId: auth.user._id, status: "paid" } },
        { $group: { _id: null, totalMinor: { $sum: { $ifNull: ["$payoutMinor", "$amountMinor"] } } } },
      ]),
      WalletTransaction.aggregate([
        {
          $match: {
            userId: auth.user._id,
            type: "ratingReward",
            status: "completed",
            $or: [
              { businessDate: businessDay.date },
              {
                businessDate: { $in: ["", null] },
                createdAt: { $gte: businessDay.start, $lt: businessDay.end },
              },
            ],
          },
        },
        { $group: { _id: null, totalMinor: { $sum: "$amountMinor" } } },
      ]),
      ReviewTaskAssignment.aggregate([
        { $match: { userId: auth.user._id, status: "submitted" } },
        { $group: { _id: null, totalMinor: { $sum: { $ifNull: ["$rewardMinor", 0] } } } },
      ]),
      WalletTransaction.aggregate([
        {
          $match: {
            userId: auth.user._id,
            type: { $in: ["ratingReward", "referralCommission", "referralMilestone"] },
            status: "completed",
          },
        },
        {
          $group: {
            _id: null,
            taskEarningsMinor: {
              $sum: { $cond: [{ $eq: ["$type", "ratingReward"] }, "$amountMinor", 0] },
            },
            levelEarningsMinor: {
              $sum: { $cond: [{ $eq: ["$type", "referralCommission"] }, "$amountMinor", 0] },
            },
            directReferralEarningsMinor: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$type", "referralCommission"] },
                      { $regexMatch: { input: { $ifNull: ["$description", ""] }, regex: "^Level 1" } },
                    ],
                  },
                  "$amountMinor",
                  0,
                ],
              },
            },
            milestoneEarningsMinor: {
              $sum: { $cond: [{ $eq: ["$type", "referralMilestone"] }, "$amountMinor", 0] },
            },
          },
        },
      ]),
      WithdrawalRequest.aggregate([
        { $match: { userId: auth.user._id, status: { $in: ["pending", "processing"] } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            amountMinor: { $sum: "$amountMinor" },
          },
        },
      ]),
    ]);
    const payoutDetails = payoutUser.payoutProfile?.encryptedDetails
      ? decryptJson(payoutUser.payoutProfile.encryptedDetails)
      : null;
    return NextResponse.json(
      {
        balanceMinor: wallet?.balanceMinor || 0,
        depositBalanceMinor: wallet?.depositBalanceMinor || 0,
        packageId: payoutUser.packageId?.toString() || "",
        packageExpiresAt: payoutUser.packageExpiresAt?.toISOString() || null,
        withdrawnMinor: withdrawn[0]?.totalMinor || 0,
        dailyCollectedMinor: dailyCollected[0]?.totalMinor || 0,
        taskEarningsMinor: earnings[0]?.taskEarningsMinor || 0,
        directReferralEarningsMinor: earnings[0]?.directReferralEarningsMinor || 0,
        levelEarningsMinor: earnings[0]?.levelEarningsMinor || 0,
        milestoneEarningsMinor: earnings[0]?.milestoneEarningsMinor || 0,
        pendingWithdrawalsMinor: pendingWithdrawals[0]?.amountMinor || 0,
        pendingWithdrawalsCount: pendingWithdrawals[0]?.count || 0,
        pendingTaskRewardsMinor: pendingTaskRewards[0]?.totalMinor || 0,
        currency: "PKR",
        ...withdrawalPolicy,
        payoutProfile: payoutDetails
          ? {
              provider: payoutUser.payoutProfile.provider,
              ...maskPayoutDetails(payoutDetails),
            }
          : null,
        transactions: transactions.map((item) => ({
          id: item._id.toString(),
          type: item.type,
          wallet: item.wallet || "earning",
          direction: item.direction,
          amountMinor: item.amountMinor,
          status: item.status,
          description: item.description,
          createdAt: item.createdAt.toISOString(),
        })),
        withdrawals: withdrawals.map((item) => ({
          id: item._id.toString(),
          amountMinor: item.amountMinor,
          status: item.status,
          provider: item.provider,
          createdAt: item.createdAt.toISOString(),
          reviewNote: item.reviewNote,
          feeMinor: item.feeMinor || 0,
          feeBasisPoints: item.feeBasisPoints || 0,
          payoutMinor: item.payoutMinor || item.amountMinor,
          withdrawalPolicySnapshot: item.withdrawalPolicySnapshot || null,
          payoutReference: item.payoutReference,
          reviewedAt: item.reviewedAt?.toISOString() || null,
          recipientName: maskPayoutDetails(decryptJson(item.encryptedPayoutDetails)).accountTitle,
          recipientAccount: (() => {
            const details = decryptJson(item.encryptedPayoutDetails);
            const account = details?.walletAddress || details?.accountNumber || "";
            return account ? `${"•".repeat(Math.max(4, account.length - 4))}${account.slice(-4)}` : "";
          })(),
        })),
        packageHistory: packageHistory.map((item) => ({
          id: item._id.toString(),
          event: item.event,
          packageName: item.packageSnapshot.name,
          amountMinor: item.amountMinor,
          currency: item.currency,
          validityDays: item.packageSnapshot.validityDays,
          dailyTaskLimit: item.packageSnapshot.dailyTaskLimit,
          perTaskEarningsMinor: item.packageSnapshot.perTaskEarningsMinor,
          minimumWithdrawalMinor: item.packageSnapshot.minimumWithdrawalMinor ?? 100,
          maximumWithdrawalMinor: item.packageSnapshot.maximumWithdrawalMinor ?? null,
          withdrawalFeeBrackets: item.packageSnapshot.withdrawalFeeBrackets || [
            { minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 },
          ],
          activatedAt: item.activatedAt.toISOString(),
          expiresAt: item.expiresAt.toISOString(),
          extendedDays: item.extendedDays || 0,
          createdAt: item.createdAt.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Loading wallet failed:", error);
    return NextResponse.json({ error: "Wallet is temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const amountMinor = parsed.body.amountMinor;
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 100 || amountMinor > 100000000) {
    return NextResponse.json({ error: "Enter a valid withdrawal amount in PKR paisa." }, { status: 400 });
  }

  const dbSession = await mongoose.startSession();
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user" || auth.user.paymentStatus !== "approved") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (await requiresCurrentTermsAcceptance(auth.user)) {
      return NextResponse.json(
        { error: currentTermsRequiredMessage(), termsRequired: true },
        { status: 428 },
      );
    }
    const rate = await consumeRateLimit(request, "withdrawal-request", {
      limit: 5,
      windowMs: 24 * 60 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many withdrawal requests. Please try again tomorrow." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
      );
    }
    let withdrawalId;
    let submittedFeeMinor;
    let submittedFeeBasisPoints;
    let submittedPayoutMinor;
    await dbSession.withTransaction(async () => {
        const user = await User.findById(auth.user._id)
          .select(
            "payoutProfile.provider +payoutProfile.encryptedDetails packageId packageName packageWithdrawalMinimumMinor packageWithdrawalMaximumMinor packageWithdrawalFeeBrackets",
          )
          .session(dbSession);
      if (!user?.payoutProfile?.encryptedDetails || !user.payoutProfile.provider) {
        const error = new Error("Save your payout details before requesting a withdrawal.");
        error.statusCode = 400;
        throw error;
      }
      const settings = await PortalSettings.findOne({ key: "global" })
        .select("withdrawalMethods")
        .session(dbSession);
      const configuredMethod = getConfiguredWithdrawalMethods(settings?.withdrawalMethods)
        .find((method) => method.provider === user.payoutProfile.provider && method.enabled);
      const payoutDetails = decryptJson(user.payoutProfile.encryptedDetails);
      if (
        !configuredMethod ||
        !payoutDetails ||
        payoutDetails.provider !== user.payoutProfile.provider ||
        !normalizePayoutDetails(payoutDetails)
      ) {
        const error = new Error("Your saved withdrawal details are invalid or this method is unavailable. Update them before requesting a withdrawal.");
        error.statusCode = 400;
        throw error;
      }
      const minimumWithdrawalMinor = user.packageWithdrawalMinimumMinor ?? 100;
      const maximumWithdrawalMinor = user.packageWithdrawalMaximumMinor ?? null;
      const feeBrackets = user.packageWithdrawalFeeBrackets || [
        { minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 },
      ];
      if (!isValidWithdrawalPolicy(minimumWithdrawalMinor, maximumWithdrawalMinor, feeBrackets)) {
        const error = new Error("Package withdrawal rules are unavailable. Contact support.");
        error.statusCode = 409;
        throw error;
      }
      if (
        amountMinor < minimumWithdrawalMinor ||
        (maximumWithdrawalMinor !== null && amountMinor > maximumWithdrawalMinor)
      ) {
        const error = new Error(
          maximumWithdrawalMinor !== null && amountMinor > maximumWithdrawalMinor
            ? "The requested amount exceeds this package's maximum withdrawal."
            : "The requested amount is below this package's minimum withdrawal.",
        );
        error.statusCode = 400;
        throw error;
      }
      const feeBasisPoints = getWithdrawalFeeBasisPoints(amountMinor, feeBrackets);
      if (feeBasisPoints === null) {
        const error = new Error("No package fee rule covers this withdrawal amount. Contact support.");
        error.statusCode = 400;
        throw error;
      }
      const feeMinor = calculateWithdrawalFee(amountMinor, 0, feeBasisPoints);
      const payoutMinor = amountMinor - feeMinor;
      if (!Number.isSafeInteger(feeMinor) || payoutMinor < 1) {
        const error = new Error("The withdrawal fee leaves no payable amount. Contact support.");
        error.statusCode = 400;
        throw error;
      }
      submittedFeeMinor = feeMinor;
      submittedFeeBasisPoints = feeBasisPoints;
      submittedPayoutMinor = payoutMinor;

      const balance = await WalletBalance.findOneAndUpdate(
        { userId: user._id, balanceMinor: { $gte: amountMinor } },
        { $inc: { balanceMinor: -amountMinor } },
        { new: true, session: dbSession },
      );
      if (!balance) {
        const error = new Error("Insufficient balance — aapke wallet mein itna balance mojood nahi hai.");
        error.statusCode = 409;
        throw error;
      }

      const [withdrawal] = await WithdrawalRequest.create(
        [
          {
            userId: user._id,
            amountMinor,
            provider: user.payoutProfile.provider,
            encryptedPayoutDetails: user.payoutProfile.encryptedDetails,
            feeMinor,
            feeBasisPoints,
            payoutMinor,
            withdrawalPolicySnapshot: {
              packageId: user.packageId || null,
              packageName: user.packageName || "",
              minimumWithdrawalMinor,
              maximumWithdrawalMinor,
              feeBrackets,
              appliedFeeBasisPoints: feeBasisPoints,
            },
          },
        ],
        { session: dbSession },
      );
      await WalletTransaction.create(
        [
          {
            userId: user._id,
            type: "withdrawal",
            direction: "debit",
            amountMinor,
            status: "completed",
            referenceId: withdrawal._id,
            idempotencyKey: `withdrawal:${withdrawal._id.toString()}`,
            description: feeMinor
              ? `Withdrawal requested (${feeMinor} paisa processing fee)`
              : "Withdrawal requested",
            ...getWalletBalanceSnapshot(balance, "earning", "debit", amountMinor),
          },
        ],
        { session: dbSession },
      );
      await createNotification(
        {
          userId: user._id,
          type: "withdrawal",
          title: "Withdrawal request submitted",
          message: `Your PKR ${(amountMinor / 100).toFixed(2)} withdrawal request is pending review.`,
        },
        dbSession,
      );
      withdrawalId = withdrawal._id.toString();
    });
    return NextResponse.json(
      {
        message: "Withdrawal request submitted.",
        withdrawalId,
        feeMinor: submittedFeeMinor,
        feeBasisPoints: submittedFeeBasisPoints,
        payoutMinor: submittedPayoutMinor,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Creating withdrawal request failed:", error);
    return NextResponse.json({ error: "Could not submit withdrawal request." }, { status: 500 });
  } finally {
    await dbSession.endSession();
  }
}
