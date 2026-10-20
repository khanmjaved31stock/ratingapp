import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getActiveRequestUser } from "@/lib/request-auth";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRenewalEligibility } from "@/lib/package-term";
import { createNotification } from "@/lib/notifications";
import RegistrationPackage from "@/models/RegistrationPackage";
import User from "@/models/User";
import WalletBalance from "@/models/WalletBalance";
import WalletTransaction from "@/models/WalletTransaction";
import FinancialTransaction from "@/models/FinancialTransaction";
import { recordPackageHistory } from "@/lib/package-history";
import { getWalletBalanceSnapshot } from "@/lib/wallet-ledger";
import { getPackageExpiryDate } from "@/lib/package-dates";
import { currentTermsRequiredMessage, requiresCurrentTermsAcceptance } from "@/lib/legal-terms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { packageId } = parsed.body;
  if (typeof packageId !== "string" || !mongoose.isValidObjectId(packageId) ||
    new mongoose.Types.ObjectId(packageId).toString() !== packageId) {
    return NextResponse.json({ error: "Choose a valid package." }, { status: 400 });
  }
  const auth = await getActiveRequestUser(request);
  if (!auth || auth.user.role !== "user" || auth.user.paymentStatus !== "approved") {
    return NextResponse.json({ error: "Only approved users can purchase a package." }, { status: 401 });
  }
  const rate = await consumeRateLimit(request, "package-purchase", { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many package purchase attempts." }, { status: 429 });
  const session = await mongoose.startSession();
  try {
    if (await requiresCurrentTermsAcceptance(auth.user)) {
      return NextResponse.json(
        { error: currentTermsRequiredMessage(), termsRequired: true },
        { status: 428 },
      );
    }
    let result;
    await session.withTransaction(async () => {
      const user = await User.findOne({
        _id: auth.user._id,
        role: "user",
        active: true,
        deletedAt: null,
        paymentStatus: "approved",
        sessionVersion: auth.session.version,
      }).session(session);
      if (!user) {
        const error = new Error("Your account is no longer active.");
        error.statusCode = 409;
        throw error;
      }
      const eligibility = await getRenewalEligibility(user, session);
      if (eligibility.active) {
        const error = new Error("Your current package is still active. You can purchase another package after it expires.");
        error.statusCode = 409;
        throw error;
      }
      const item = await RegistrationPackage.findOne({
        _id: packageId,
        active: true,
        archivedAt: null,
      }).session(session);
      if (!item) {
        const error = new Error("The selected package is unavailable.");
        error.statusCode = 404;
        throw error;
      }
      if (eligibility.cooldownActive && item._id.toString() !== eligibility.recommendedPackageId) {
        const error = new Error("During the package renewal cooldown, only the recommended package can be purchased.");
        error.statusCode = 409;
        throw error;
      }
      if (item.eligibleReferralTiers?.length && !item.eligibleReferralTiers.includes(user.referralTier || "__unassigned__")) {
        const error = new Error("Your account is not eligible for this package tier.");
        error.statusCode = 403;
        throw error;
      }
      const previousPackage = {
        packageId: user.packageId,
        packageName: user.packageName,
        packagePriceMinor: user.packagePriceMinor,
        packageActivatedAt: user.packageActivatedAt,
        packageExpiresAt: user.packageExpiresAt,
      };
      const balance = await WalletBalance.findOneAndUpdate(
        { userId: user._id, depositBalanceMinor: { $gte: item.priceMinor } },
        { $inc: { depositBalanceMinor: -item.priceMinor } },
        { new: true, session },
      );
      if (!balance) {
        const error = new Error("Insufficient Deposit Wallet balance. Submit a deposit proof and wait for approval.");
        error.statusCode = 409;
        throw error;
      }
      const activatedAt = new Date();
      const expiresAt = getPackageExpiryDate(activatedAt, item.validityDays);
      user.packageId = item._id;
      user.packagePriceMinor = item.priceMinor;
      user.packageCurrency = item.currency;
      user.packageName = item.name;
      user.packageValidityDays = item.validityDays;
      user.packageActivatedAt = activatedAt;
      user.packageExpiresAt = expiresAt;
      user.packageDailyEarningLimitMinor = item.dailyEarningLimitMinor || 0;
      user.packageDailyTaskQuota = item.dailyTaskLimit ?? item.dailyTaskQuota ?? 0;
      user.packageDailyTaskLimit = item.dailyTaskLimit ?? item.dailyTaskQuota ?? 0;
      user.packagePerTaskEarningsMinor = item.perTaskEarningsMinor || 0;
      user.packageWithdrawalMinimumMinor = item.minimumWithdrawalMinor ?? 100;
      user.packageWithdrawalMaximumMinor = item.maximumWithdrawalMinor ?? null;
      user.packageWithdrawalFeeBrackets = item.withdrawalFeeBrackets || [
        { minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 },
      ];
      user.packageDescription = item.description || "";
      user.packageBenefits = item.benefits || [];
      await user.save({ session });
      const referenceId = new mongoose.Types.ObjectId();
      await recordPackageHistory({
        user: { ...user.toObject(), ...previousPackage },
        packageSnapshot: item,
        event: previousPackage.packageActivatedAt ? "renewed" : "activated",
        sourceType: "walletPurchase",
        sourceId: referenceId,
        amountMinor: item.priceMinor,
        activatedAt,
        expiresAt,
        session,
      });
      await WalletTransaction.create([{
        userId: user._id,
        type: "packagePurchase",
        wallet: "deposit",
        direction: "debit",
        amountMinor: item.priceMinor,
        status: "completed",
        referenceId,
        idempotencyKey: `package-purchase:${referenceId.toString()}`,
        description: `Purchased ${item.name} package`,
        ...getWalletBalanceSnapshot(balance, "deposit", "debit", item.priceMinor),
      }], { session });
      await FinancialTransaction.create([{
        type: "packageRevenue",
        amountMinor: item.priceMinor,
        currency: item.currency,
        status: "completed",
        referenceId,
        userId: user._id,
        idempotencyKey: `package-purchase-financial:${referenceId.toString()}`,
        description: `Deposit Wallet purchase of ${item.name}`,
        registrationSnapshot: {
          packageName: item.name,
          packageDescription: item.description,
          packageBenefits: item.benefits,
          packageId: item._id,
          packagePriceMinor: item.priceMinor,
          submittedAt: activatedAt,
          approvedAt: activatedAt,
        },
      }], { session });
      await createNotification({
        userId: user._id,
        type: "package",
        title: "Package activated",
        message: `${item.name} is active until ${expiresAt.toLocaleDateString()}.`,
      }, session);
      result = {
        packageName: item.name,
        packageExpiresAt: expiresAt.toISOString(),
        depositBalanceMinor: balance.depositBalanceMinor,
      };
    });
    return NextResponse.json({ message: `${result.packageName} activated successfully.`, ...result });
  } catch (error) {
    if (error.statusCode) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Purchasing package from Deposit Wallet failed:", error);
    return NextResponse.json({ error: "Could not purchase this package." }, { status: 500 });
  } finally {
    await session.endSession();
  }
}
