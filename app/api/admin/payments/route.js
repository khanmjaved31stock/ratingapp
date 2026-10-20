import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { writeAdminAudit, writeSecurityEvent } from "@/lib/audit";
import { privateImageUrl } from "@/lib/cloudinary";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import FinancialTransaction from "@/models/FinancialTransaction";
import PaymentVerification from "@/models/PaymentVerification";
import PortalSettings from "@/models/PortalSettings";
import ReferralEvent from "@/models/ReferralEvent";
import User from "@/models/User";
import WalletBalance from "@/models/WalletBalance";
import WalletTransaction from "@/models/WalletTransaction";
import { getRenewalEligibility } from "@/lib/package-term";
import { getRequestIp } from "@/lib/request-ip";
import { consumeRateLimit } from "@/lib/rate-limit";
import { ensurePackageTerm } from "@/lib/package-term";
import { createNotification } from "@/lib/notifications";
import { recordPackageHistory } from "@/lib/package-history";
import { getWalletBalanceSnapshot } from "@/lib/wallet-ledger";
import { getPackageExpiryDate } from "@/lib/package-dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await requireStaff(request, ["superAdmin", "helpAdmin"]);
    if (auth.response) return auth.response;

    const payments = await PaymentVerification.find()
      .populate("userId", "name email")
      .populate("packageId", "name")
      .populate("paymentAccountId", "displayName provider accountTitle accountNumber")
      .populate("reviewedBy", "name email")
      .sort({ status: 1, createdAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json(
      {
        payments: payments.map((item) => ({
          id: item._id.toString(),
          user: item.userId
            ? { id: item.userId._id.toString(), name: item.userId.name, email: item.userId.email }
            : null,
          packageName: item.packageName || item.packageId?.name || "Removed package",
          purchaseType: item.purchaseType || "registration",
          amountMinor: item.packagePriceMinor,
          currency: item.currency,
          paymentAccount: item.paymentAccountId
            ? {
                displayName: item.paymentAccountId.displayName,
                provider: item.paymentAccountId.provider,
                accountTitle: item.paymentAccountId.accountTitle,
                accountNumber: item.paymentAccountId.accountNumber,
              }
            : null,
          transactionId: item.transactionId,
          senderName: item.senderName,
          senderAccountNumber: item.senderAccountNumber,
          proofUrl: privateImageUrl(item.proofPublicId, Math.floor(Date.now() / 1000) + 300),
          status: item.status,
          reviewNote: item.reviewNote,
          submissionIpAddress: item.submissionIpAddress || "",
          approvalIpAddress: item.approvalIpAddress || "",
          approvedAt: item.approvedAt?.toISOString() || "",
          createdAt: item.createdAt.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Loading payment verification queue failed:", error);
    return NextResponse.json(
      { error: "Could not load payment verification queue." },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { id, decision, reviewNote } = parsed.body;
  if (
    typeof id !== "string" ||
    !mongoose.isValidObjectId(id) ||
    new mongoose.Types.ObjectId(id).toString() !== id ||
    !["approved", "rejected"].includes(decision) ||
    (reviewNote !== undefined &&
      (typeof reviewNote !== "string" || reviewNote.length > 500))
  ) {
    return NextResponse.json({ error: "Invalid payment review action." }, { status: 400 });
  }

  const actor = await requireStaff(request, ["superAdmin", "helpAdmin"]);
  if (actor.response) return actor.response;
  const rate = await consumeRateLimit(request, "admin-payment-review", {
    limit: 50,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many payment review actions. Please try again later." }, { status: 429 });
  }

  const dbSession = await mongoose.startSession();
  try {
    let updatedPayment;
    const reviewedAt = new Date();
    const approvalIpAddress = decision === "approved" ? (getRequestIp(request) || "") : "";
    await dbSession.withTransaction(async () => {
      const payment = await PaymentVerification.findOneAndUpdate(
        { _id: id, status: "pending" },
        {
          $set: {
            status: decision,
            reviewedBy: actor.user._id,
            reviewedAt,
            reviewNote: reviewNote?.trim() || "",
            ...(decision === "approved" ? { approvedAt: reviewedAt, approvalIpAddress } : {}),
          },
        },
        { new: true, session: dbSession },
      );
      if (!payment) {
        const error = new Error("Payment is no longer pending.");
        error.statusCode = 409;
        throw error;
      }

      const user = await User.findOne({ _id: payment.userId }).session(dbSession);
      if (!user || user.deletedAt) {
        const error = new Error("The linked account no longer exists.");
        error.statusCode = 409;
        throw error;
      }

      if (decision === "approved") {
        const packageActivatedAt = reviewedAt;
        const portalSettings = await PortalSettings.findOne({ key: "global" })
          .select("packagePolicy referralLevels referralMilestones")
          .session(dbSession);
        const validityDays = payment.packageValidityDays || portalSettings?.packagePolicy?.validityDays || 30;
        const packageExpiresAt = getPackageExpiryDate(packageActivatedAt, validityDays);
        if (payment.purchaseType === "renewal") {
          const eligibility = await getRenewalEligibility(user, dbSession);
          if (eligibility.cooldownActive && payment.packageId.toString() !== eligibility.recommendedPackageId) {
            const error = new Error("The renewal package does not meet the active package policy.");
            error.statusCode = 409;
            throw error;
          }
        }
        const activated = await User.updateOne(
          {
            _id: user._id,
            paymentStatus: payment.purchaseType === "renewal" ? "approved" : "pending",
          },
          {
            $set: {
              paymentStatus: "approved",
              active: true,
              packageId: payment.packageId,
              packagePriceMinor: payment.packagePriceMinor,
              packageCurrency: payment.currency,
              packageName: payment.packageName || "Registration package",
              packageDescription: payment.packageDescription || "",
              packageBenefits: payment.packageBenefits || [],
              packageValidityDays: validityDays,
              packageActivatedAt,
              packageExpiresAt,
              packageDailyEarningLimitMinor: payment.packageDailyEarningLimitMinor || 0,
              packageDailyTaskQuota: payment.packageDailyTaskQuota || 0,
              packageDailyTaskLimit: payment.packageDailyTaskLimit ?? payment.packageDailyTaskQuota ?? 0,
              packagePerTaskEarningsMinor: payment.packagePerTaskEarningsMinor || 0,
              packageWithdrawalMinimumMinor: payment.packageWithdrawalMinimumMinor ?? 100,
              packageWithdrawalMaximumMinor: payment.packageWithdrawalMaximumMinor ?? null,
              packageWithdrawalFeeBrackets: payment.packageWithdrawalFeeBrackets,
            },
          },
          { session: dbSession },
        );
        if (activated.modifiedCount !== 1) {
          const error = new Error("The account status changed before this payment could be approved.");
          error.statusCode = 409;
          throw error;
        }
        await recordPackageHistory({
          user,
          packageSnapshot: {
            packageId: payment.packageId,
            name: payment.packageName,
            description: payment.packageDescription,
            benefits: payment.packageBenefits,
            priceMinor: payment.packagePriceMinor,
            currency: payment.currency,
            validityDays,
            dailyTaskLimit: payment.packageDailyTaskLimit ?? payment.packageDailyTaskQuota ?? 0,
            dailyEarningLimitMinor: payment.packageDailyEarningLimitMinor || 0,
            perTaskEarningsMinor: payment.packagePerTaskEarningsMinor || 0,
            minimumWithdrawalMinor: payment.packageWithdrawalMinimumMinor ?? 100,
            maximumWithdrawalMinor: payment.packageWithdrawalMaximumMinor ?? null,
            withdrawalFeeBrackets: payment.packageWithdrawalFeeBrackets,
          },
          event: payment.purchaseType === "renewal" ? "renewed" : "activated",
          sourceType: "paymentVerification",
          sourceId: payment._id,
          actorId: actor.user._id,
          amountMinor: payment.packagePriceMinor,
          activatedAt: packageActivatedAt,
          expiresAt: packageExpiresAt,
          session: dbSession,
        });
        await createNotification(
          {
            userId: user._id,
            type: "package",
            title: payment.purchaseType === "renewal" ? "Package renewed" : "Package activated",
            message: `${payment.packageName || "Your package"} is active until ${packageExpiresAt.toLocaleDateString()}.`,
          },
          dbSession,
        );
        await FinancialTransaction.create(
          [
            {
              type: "packageRevenue",
              amountMinor: payment.packagePriceMinor,
              currency: payment.currency,
              status: "completed",
              referenceId: payment._id,
              userId: user._id,
              paymentVerificationId: payment._id,
              idempotencyKey: `package-payment:${payment._id.toString()}`,
              description: `Approved ${payment.packageName || "registration"} ${payment.purchaseType || "registration"} package`,
              registrationSnapshot: {
                transactionId: payment.transactionId,
                senderName: payment.senderName,
                senderAccountNumber: payment.senderAccountNumber,
                packageName: payment.packageName || "",
                packageDescription: payment.packageDescription || "",
                packageBenefits: payment.packageBenefits || [],
                packageId: payment.packageId,
                packagePriceMinor: payment.packagePriceMinor,
                submittedAt: payment.createdAt,
                submissionIpAddress: payment.submissionIpAddress || "",
                approvedAt: reviewedAt,
                approvalIpAddress,
              },
              createdBy: actor.user._id,
            },
          ],
          { session: dbSession },
        );

        const settings = portalSettings || await PortalSettings.findOne({ key: "global" }).session(dbSession);
        let ancestorId = payment.purchaseType === "renewal" ? null : user.referredBy;
        const levels = [...(settings?.referralLevels || [])].sort((a, b) => a.level - b.level);
        for (const level of levels) {
          if (!ancestorId) break;
          const ancestor = await User.findOne({
            _id: ancestorId,
            role: "user",
            active: true,
            deletedAt: null,
            paymentStatus: "approved",
          })
            .select("_id referredBy paymentStatus packageActivatedAt packageExpiresAt")
            .session(dbSession);
          if (!ancestor) break;
          const ancestorTerm = await ensurePackageTerm(ancestor, dbSession);
          const commission = ancestorTerm.active
            ? Math.floor((payment.packagePriceMinor * level.basisPoints) / 10000)
            : 0;
          if (commission > 0) {
            const balance = await WalletBalance.findOneAndUpdate(
              { userId: ancestor._id },
              {
                $inc: { balanceMinor: commission },
                $setOnInsert: { currency: "PKR" },
              },
              { upsert: true, new: true, session: dbSession },
            );
            await WalletTransaction.create(
              [
                {
                  userId: ancestor._id,
                  type: "referralCommission",
                  direction: "credit",
                  amountMinor: commission,
                  currency: payment.currency,
                  status: "completed",
                  referenceId: payment._id,
                  idempotencyKey: `referral:${payment._id.toString()}:${ancestor._id.toString()}`,
                  description: `Level ${level.level} referral commission`,
                  createdBy: actor.user._id,
                  ...getWalletBalanceSnapshot(balance, "earning", "credit", commission),
                },
              ],
              { session: dbSession },
            );
          }
          ancestorId = ancestor.referredBy;
        }
        if (user.referredBy && payment.purchaseType !== "renewal") {
          let ancestorId = user.referredBy;
          for (let depth = 1; depth <= 10 && ancestorId; depth += 1) {
            const counterField = depth === 1
              ? "referralDirectConversions"
              : "referralIndirectConversions";
            const ancestor = await User.findOneAndUpdate(
              {
                _id: ancestorId,
                role: "user",
                active: true,
                deletedAt: null,
                paymentStatus: "approved",
              },
              { $inc: { [counterField]: 1 } },
              { new: true, session: dbSession },
            ).select("_id referredBy paymentStatus packageActivatedAt packageExpiresAt referralDirectConversions referralIndirectConversions");
            if (!ancestor) break;
            await ReferralEvent.create(
              [
                {
                  referrerId: ancestor._id,
                  referredUserId: user._id,
                  type: "conversion",
                  level: depth,
                  createdAt: reviewedAt,
                },
              ],
              { session: dbSession },
            );
            if (depth === 1) {
              await createNotification(
                {
                  userId: ancestor._id,
                  type: "referral",
                  title: "A team member activated",
                  message: `${user.name} completed package activation through your referral.`,
                },
                dbSession,
              );
            }

            for (const milestone of settings?.referralMilestones || []) {
              const ancestorTerm = await ensurePackageTerm(ancestor, dbSession);
              if (!ancestorTerm.active) continue;
              let directConversions = ancestor.referralDirectConversions;
              let indirectConversions = ancestor.referralIndirectConversions;
              if (milestone.windowSeconds > 0) {
                const windowStart = new Date(reviewedAt.getTime() - milestone.windowSeconds * 1000);
                const directCount = await ReferralEvent.countDocuments({
                  referrerId: ancestor._id,
                  type: "conversion",
                  level: 1,
                  createdAt: { $gte: windowStart, $lte: reviewedAt },
                }).session(dbSession);
                const indirectCount = await ReferralEvent.countDocuments({
                  referrerId: ancestor._id,
                  type: "conversion",
                  level: { $gt: 1 },
                  createdAt: { $gte: windowStart, $lte: reviewedAt },
                }).session(dbSession);
                directConversions = directCount;
                indirectConversions = indirectCount;
              }
              if (
                directConversions < milestone.directConversions ||
                indirectConversions < milestone.indirectConversions
              ) continue;
              const claimed = await User.updateOne(
                {
                  _id: ancestor._id,
                  unlockedReferralMilestones: { $ne: milestone.id },
                },
                {
                  $addToSet: { unlockedReferralMilestones: milestone.id },
                  ...(milestone.tier ? { $set: { referralTier: milestone.tier } } : {}),
                },
                { session: dbSession },
              );
              if (claimed.modifiedCount !== 1) continue;
              if (milestone.rewardMinor > 0) {
                const balance = await WalletBalance.findOneAndUpdate(
                  { userId: ancestor._id },
                  {
                    $inc: { balanceMinor: milestone.rewardMinor },
                    $setOnInsert: { currency: "PKR" },
                  },
                  { upsert: true, new: true, session: dbSession },
                );
                await WalletTransaction.create(
                  [
                    {
                      userId: ancestor._id,
                      type: "referralMilestone",
                      direction: "credit",
                      amountMinor: milestone.rewardMinor,
                      currency: "PKR",
                      status: "completed",
                      referenceId: payment._id,
                      idempotencyKey: `referral-milestone:${ancestor._id.toString()}:${milestone.id}`,
                      description: `Referral milestone reward: ${milestone.title}`,
                      createdBy: actor.user._id,
                      ...getWalletBalanceSnapshot(balance, "earning", "credit", milestone.rewardMinor),
                    },
                  ],
                  { session: dbSession },
                );
              }
            }
            ancestorId = ancestor.referredBy;
          }
        }
      } else {
        await writeSecurityEvent(request, {
          type: "paymentRejected",
          userId: user._id,
          email: user.email,
          details: "Registration payment proof rejected.",
        });
      }

      await writeAdminAudit(
        request,
        actor,
        `payment.${decision}`,
        {
          type: "PaymentVerification",
          id,
          metadata: { amountMinor: payment.packagePriceMinor, currency: payment.currency },
          session: dbSession,
        },
      );
      updatedPayment = payment;
    });

    return NextResponse.json({
      message: `Payment ${decision}.`,
      status: updatedPayment.status,
    });
  } catch (error) {
    if (error.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Reviewing payment failed:", error);
    return NextResponse.json({ error: "Could not update payment status." }, { status: 500 });
  } finally {
    await dbSession.endSession();
  }
}
