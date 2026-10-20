import mongoose from "mongoose";
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import PaymentAccount from "@/models/PaymentAccount";
import PaymentVerification from "@/models/PaymentVerification";
import DepositRequest from "@/models/DepositRequest";
import PaymentReference from "@/models/PaymentReference";
import RegistrationPackage from "@/models/RegistrationPackage";
import User from "@/models/User";
import { getActiveRequestUser } from "@/lib/request-auth";
import {
  deleteCloudinaryAsset,
  uploadPrivateImage,
} from "@/lib/cloudinary";
import { readPaymentProof } from "@/lib/payment-proof";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request";
import { getRequestIp } from "@/lib/request-ip";
import { getRenewalEligibility } from "@/lib/package-term";
import { privateImageUrl } from "@/lib/cloudinary";
import { currentTermsRequiredMessage, requiresCurrentTermsAcceptance } from "@/lib/legal-terms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await getActiveRequestUser(request, {
      allowPendingPayment: true,
    });
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const user = await User.findById(auth.user._id).select(
      "packageId packagePriceMinor packageCurrency packageName packageDescription packageBenefits packageValidityDays packageDailyEarningLimitMinor packageDailyTaskQuota packageDailyTaskLimit packagePerTaskEarningsMinor packageWithdrawalMinimumMinor packageWithdrawalMaximumMinor packageWithdrawalFeeBrackets paymentStatus active packageActivatedAt packageExpiresAt referralTier",
    );
    const eligibility = await getRenewalEligibility(user);
    const term = eligibility;
    const canRenew = user?.paymentStatus === "approved" && !term.active;
    if (canRenew) {
      return NextResponse.json({
        error: "Package renewals are purchased from your Deposit Wallet. Add funds and select a package on the Wallet page.",
        useDepositWallet: true,
      }, { status: 409 });
    }
    if (!user || !["pending", "approved"].includes(user.paymentStatus) ||
      (user.paymentStatus === "approved" && !canRenew)) {
      return NextResponse.json({ error: "There is no package payment due for this account." }, { status: 409 });
    }
    const [registrationPackage, accounts, verification, availablePackages] = await Promise.all([
      user.packageId
        ? RegistrationPackage.findById(user.packageId)
            .select("name description benefits active validityDays dailyEarningLimitMinor dailyTaskQuota dailyTaskLimit perTaskEarningsMinor")
            .lean()
        : null,
      PaymentAccount.find({ active: true, archivedAt: null })
        .select("provider displayName accountTitle accountNumber bankName instructions qrPublicId sortOrder")
        .sort({ sortOrder: 1, provider: 1 })
        .lean(),
      PaymentVerification.findOne({ userId: user._id })
        .sort({ createdAt: -1 })
        .select("transactionId status reviewNote createdAt proofPublicId")
        .lean(),
      canRenew
        ? RegistrationPackage.find({
            active: true,
            $and: [
              eligibility.cooldownActive ? { _id: eligibility.recommendedPackageId } : {},
              {
                $or: [
                  { eligibleReferralTiers: { $exists: false } },
                  { eligibleReferralTiers: { $size: 0 } },
                  { eligibleReferralTiers: user.referralTier || "__unassigned__" },
                ],
              },
            ],
          })
            .select("name description benefits priceMinor currency eligibleReferralTiers validityDays dailyEarningLimitMinor dailyTaskQuota dailyTaskLimit perTaskEarningsMinor minimumWithdrawalMinor maximumWithdrawalMinor withdrawalFeeBrackets")
            .sort({ sortOrder: 1, priceMinor: 1 })
            .lean()
        : [],
    ]);

    return NextResponse.json(
      {
        package: registrationPackage
          ? {
              name: user.paymentStatus === "pending"
                ? user.packageName || registrationPackage.name
                : user.packageName || registrationPackage.name,
              id: registrationPackage._id.toString(),
              description: user.paymentStatus === "pending"
                ? user.packageDescription || registrationPackage.description
                : user.packageDescription || registrationPackage.description,
              benefits: user.paymentStatus === "pending"
                ? user.packageBenefits || registrationPackage.benefits
                : user.packageBenefits || registrationPackage.benefits,
              priceMinor: user.packagePriceMinor,
              currency: user.packageCurrency,
              active: registrationPackage.active,
              validityDays: user.paymentStatus === "pending"
                ? user.packageValidityDays || registrationPackage.validityDays || 30
                : user.packageValidityDays || registrationPackage.validityDays || 30,
              dailyEarningLimitMinor: user.paymentStatus === "pending"
                ? user.packageDailyEarningLimitMinor || 0
                : user.packageDailyEarningLimitMinor || 0,
              dailyTaskQuota: user.paymentStatus === "pending"
                ? user.packageDailyTaskQuota || 0
                : user.packageDailyTaskQuota || 0,
              dailyTaskLimit: user.paymentStatus === "pending"
                ? user.packageDailyTaskLimit ?? user.packageDailyTaskQuota ?? 0
                : user.packageDailyTaskLimit ?? user.packageDailyTaskQuota ?? 0,
              perTaskEarningsMinor: user.paymentStatus === "pending"
                ? user.packagePerTaskEarningsMinor || 0
                : user.packagePerTaskEarningsMinor || 0,
              minimumWithdrawalMinor: user.paymentStatus === "pending"
                ? user.packageWithdrawalMinimumMinor ?? 100
                : user.packageWithdrawalMinimumMinor ?? 100,
              maximumWithdrawalMinor: user.paymentStatus === "pending"
                ? user.packageWithdrawalMaximumMinor ?? null
                : user.packageWithdrawalMaximumMinor ?? null,
              withdrawalFeeBrackets: user.paymentStatus === "pending"
                ? user.packageWithdrawalFeeBrackets
                : user.packageWithdrawalFeeBrackets,
            }
          : null,
        canRenew,
        cooldownActive: eligibility.cooldownActive,
        cooldownEndsAt: eligibility.cooldownEndsAt?.toISOString() || null,
        availablePackages: availablePackages.map((item) => ({
          id: item._id.toString(),
          name: item.name,
          description: item.description,
          benefits: item.benefits,
          priceMinor: item.priceMinor,
          currency: item.currency,
          eligibleReferralTiers: item.eligibleReferralTiers || [],
          validityDays: item.validityDays || 30,
          dailyEarningLimitMinor: item.dailyEarningLimitMinor || 0,
          dailyTaskQuota: item.dailyTaskQuota || 0,
          dailyTaskLimit: item.dailyTaskLimit ?? item.dailyTaskQuota ?? 0,
          perTaskEarningsMinor: item.perTaskEarningsMinor || 0,
          minimumWithdrawalMinor: item.minimumWithdrawalMinor ?? 100,
          maximumWithdrawalMinor: item.maximumWithdrawalMinor ?? null,
          withdrawalFeeBrackets: item.withdrawalFeeBrackets,
        })),
        paymentAccounts: accounts.map((account) => ({
          id: account._id.toString(),
          provider: account.provider,
          displayName: account.displayName,
          accountTitle: account.accountTitle,
          accountNumber: account.accountNumber,
          bankName: account.bankName,
          instructions: account.instructions || "",
          qrUrl: account.qrPublicId
            ? privateImageUrl(account.qrPublicId, Math.floor(Date.now() / 1000) + 3600)
            : "",
        })),
        verification: verification
          ? {
              transactionId: verification.transactionId,
              status: verification.status,
              reviewNote: verification.reviewNote,
              createdAt: verification.createdAt.toISOString(),
            }
          : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Loading payment instructions failed:", error);
    return NextResponse.json(
      { error: "Payment instructions are temporarily unavailable." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let stage = "authentication";
  try {
    const auth = await getActiveRequestUser(request, {
      allowPendingPayment: true,
    });
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (await requiresCurrentTermsAcceptance(auth.user)) {
      return NextResponse.json(
        { error: currentTermsRequiredMessage(), termsRequired: true },
        { status: 428 },
      );
    }

    stage = "rate limiting";
    const rate = await consumeRateLimit(request, "payment-proof", {
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many proof submissions. Please try again later." },
        { status: 429 },
      );
    }

    stage = "reading multipart form data";
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
      return NextResponse.json(
        { error: "The payment form must be submitted as multipart form data, including its screenshot." },
        { status: 415 },
      );
    }
    let formData;
    try {
      formData = await request.formData();
    } catch (error) {
      console.error("Parsing payment proof multipart form failed:", error);
      return NextResponse.json(
        { error: "The upload form could not be read. Please retry with a JPEG, PNG, or WebP image under 5 MB." },
        { status: 400 },
      );
    }
    const transactionId =
      typeof formData.get("transactionId") === "string"
        ? formData.get("transactionId").trim()
        : "";
    const senderName =
      typeof formData.get("senderName") === "string"
        ? formData.get("senderName").trim()
        : "";
    const senderAccountNumber =
      typeof formData.get("senderAccountNumber") === "string"
        ? formData.get("senderAccountNumber").trim()
        : "";
    const paymentAccountId = formData.get("paymentAccountId");
    const requestedPackageId = formData.get("packageId");

    if (
      !transactionId ||
      transactionId.length > 120 ||
      !senderName ||
      senderName.length > 120 ||
      !senderAccountNumber ||
      senderAccountNumber.length > 64 ||
      typeof paymentAccountId !== "string" ||
      !/^[a-f\d]{24}$/i.test(paymentAccountId) ||
      (requestedPackageId !== null &&
        (typeof requestedPackageId !== "string" || !/^[a-f\d]{24}$/i.test(requestedPackageId)))
    ) {
      return NextResponse.json(
        { error: "Enter a transaction ID, sender name, sender account number, and a valid payment account." },
        { status: 400 },
      );
    }

    stage = "validating payment screenshot";
    const proof = await readPaymentProof(formData);
    if (proof.error) {
      return NextResponse.json({ error: proof.error }, { status: 400 });
    }

    stage = "checking payment account and registration";
    await connectDB();
    await PaymentReference.init();
    const transactionIdKey = transactionId.toLowerCase();
    const [user, account, existingSubmission, duplicateDeposit, duplicatePayment, duplicateReference] = await Promise.all([
      User.findById(auth.user._id).select(
        "packageId packagePriceMinor packageCurrency packageName packageDescription packageBenefits packageValidityDays packageDailyEarningLimitMinor packageDailyTaskQuota packageDailyTaskLimit packagePerTaskEarningsMinor packageWithdrawalMinimumMinor packageWithdrawalMaximumMinor packageWithdrawalFeeBrackets paymentStatus active packageActivatedAt packageExpiresAt referralTier termsAcceptedAt termsVersion",
      ),
      PaymentAccount.findOne({ _id: paymentAccountId, active: true, archivedAt: null }).select("_id"),
      PaymentVerification.exists({
        userId: auth.user._id,
        status: "pending",
      }),
      DepositRequest.findOne({ transactionId })
        .collation({ locale: "en", strength: 2 })
        .select("_id")
        .lean(),
      PaymentVerification.findOne({ transactionId })
        .collation({ locale: "en", strength: 2 })
        .select("_id")
        .lean(),
      PaymentReference.exists({ transactionIdKey }),
    ]);
    const eligibility = await getRenewalEligibility(user);
    const term = eligibility;
    const isRegistration = user?.paymentStatus === "pending";
    const isRenewal = user?.paymentStatus === "approved" && !term.active;
    if (isRenewal) {
      return NextResponse.json({
        error: "Package renewals are purchased from your Deposit Wallet. Add funds and select a package on the Wallet page.",
        useDepositWallet: true,
      }, { status: 409 });
    }
    if (!user || (!isRegistration && !isRenewal) || !user.packageId) {
      return NextResponse.json({ error: "This account cannot submit a payment proof." }, { status: 409 });
    }
    if (!account) {
      return NextResponse.json({ error: "Choose an active company payment account." }, { status: 400 });
    }
    if (existingSubmission) {
      return NextResponse.json({ error: "A payment proof is already awaiting review." }, { status: 409 });
    }
    if (duplicateDeposit || duplicatePayment || duplicateReference) {
      return NextResponse.json({ error: "This transaction ID has already been submitted." }, { status: 409 });
    }

    const packageId = isRenewal && requestedPackageId ? requestedPackageId : user.packageId;
    if (isRenewal && eligibility.cooldownActive && packageId.toString() !== eligibility.recommendedPackageId) {
      return NextResponse.json({
        error: "During the renewal cooldown, only your recommended package can be activated.",
        cooldownEndsAt: eligibility.cooldownEndsAt?.toISOString() || null,
        recommendedPackageId: eligibility.recommendedPackageId,
      }, { status: 409 });
    }
    if (isRegistration && requestedPackageId && requestedPackageId !== user.packageId.toString()) {
      return NextResponse.json({ error: "Choose the package selected during registration." }, { status: 400 });
    }
    const registrationPackage = await RegistrationPackage.findOne({
      _id: packageId,
      ...(isRenewal ? { active: true } : {}),
      ...(isRenewal ? {
        $or: [
          { eligibleReferralTiers: { $exists: false } },
          { eligibleReferralTiers: { $size: 0 } },
          { eligibleReferralTiers: user.referralTier || "__unassigned__" },
        ],
      } : {}),
    }).select("_id name description benefits priceMinor currency validityDays dailyEarningLimitMinor dailyTaskQuota dailyTaskLimit perTaskEarningsMinor minimumWithdrawalMinor maximumWithdrawalMinor withdrawalFeeBrackets");
    if (!registrationPackage) {
      return NextResponse.json({ error: "The selected package is no longer available." }, { status: 409 });
    }

    stage = "uploading screenshot to Cloudinary";
    const uploaded = await uploadPrivateImage(proof.bytes, {
      folder: "ratewell/payment-proofs",
    });
    try {
      stage = "saving payment verification";
      const session = await mongoose.startSession();
      let verification;
      try {
        await session.withTransaction(async () => {
          [verification] = await PaymentVerification.create([{
            userId: user._id,
            packageId: registrationPackage._id,
            purchaseType: isRenewal ? "renewal" : "registration",
            packagePriceMinor: isRenewal ? registrationPackage.priceMinor : user.packagePriceMinor,
            packageValidityDays: isRenewal ? registrationPackage.validityDays || 30 : user.packageValidityDays || 30,
            packageDailyEarningLimitMinor: isRenewal ? registrationPackage.dailyEarningLimitMinor || 0 : user.packageDailyEarningLimitMinor || 0,
            packageDailyTaskQuota: isRenewal ? registrationPackage.dailyTaskQuota || 0 : user.packageDailyTaskQuota || 0,
            packageDailyTaskLimit: isRenewal
              ? registrationPackage.dailyTaskLimit ?? registrationPackage.dailyTaskQuota ?? 0
              : user.packageDailyTaskLimit ?? user.packageDailyTaskQuota ?? 0,
            packagePerTaskEarningsMinor: isRenewal ? registrationPackage.perTaskEarningsMinor || 0 : user.packagePerTaskEarningsMinor || 0,
            packageWithdrawalMinimumMinor: isRenewal
              ? registrationPackage.minimumWithdrawalMinor ?? 100
              : user.packageWithdrawalMinimumMinor ?? 100,
            packageWithdrawalMaximumMinor: isRenewal
              ? registrationPackage.maximumWithdrawalMinor ?? null
              : user.packageWithdrawalMaximumMinor ?? null,
            packageWithdrawalFeeBrackets: isRenewal
              ? registrationPackage.withdrawalFeeBrackets
              : user.packageWithdrawalFeeBrackets,
            packageName: isRenewal ? registrationPackage.name : user.packageName || registrationPackage.name,
            packageDescription: isRenewal ? registrationPackage.description : user.packageDescription || registrationPackage.description,
            packageBenefits: isRenewal ? registrationPackage.benefits : user.packageBenefits || registrationPackage.benefits,
            currency: isRenewal ? registrationPackage.currency : user.packageCurrency,
            paymentAccountId: account._id,
            transactionId,
            senderName,
            senderAccountNumber,
            submissionIpAddress: getRequestIp(request) || "",
            proofUrl: uploaded.secureUrl,
            proofPublicId: uploaded.publicId,
          }], { session });
          await PaymentReference.create([{
            transactionIdKey,
            sourceType: "packagePayment",
            sourceId: verification._id,
          }], { session });
        });
      } finally {
        await session.endSession();
      }

      return NextResponse.json(
        {
          message: "Payment proof submitted for manual verification.",
          verification: {
            id: verification._id.toString(),
            status: verification.status,
          },
        },
        { status: 201 },
      );
    } catch (error) {
      try {
        await deleteCloudinaryAsset(uploaded.publicId);
      } catch (cleanupError) {
        console.error("Removing orphaned Cloudinary payment proof failed:", {
          name: cleanupError?.name,
          code: cleanupError?.http_code || cleanupError?.code,
        });
      }
      throw error;
    }
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { error: "This transaction ID has already been submitted." },
        { status: 409 },
      );
    }
    console.error("Submitting payment proof failed:", {
      stage,
      name: error?.name,
      code: error?.http_code || error?.code,
      status: error?.status || error?.statusCode,
    });
    return NextResponse.json(
      { error: "Payment proof could not be submitted. Please try again or contact support if the problem continues." },
      { status: 500 },
    );
  }
}
