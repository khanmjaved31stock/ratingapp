import { NextResponse } from "next/server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import RegistrationPackage from "@/models/RegistrationPackage";
import ReferralEvent from "@/models/ReferralEvent";
import TrafficEvent from "@/models/TrafficEvent";
import PortalSettings from "@/models/PortalSettings";
import { isSameOriginRequest, normalizeEmail, readJsonBody, validPassword } from "@/lib/request";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isMaintenanceMode } from "@/lib/maintenance";
import { isEmailDeliveryConfigured } from "@/lib/auth-email";
import { DEFAULT_TERMS_VERSION } from "@/lib/legal-terms";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp-phone";

export const runtime = "nodejs";

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const parsed = await readJsonBody(request);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const name = typeof parsed.body.name === "string" ? parsed.body.name.trim() : "";
  const email = normalizeEmail(parsed.body.email);
  const password = parsed.body.password;
  const whatsappPhone = normalizeWhatsAppPhone(parsed.body.whatsappPhone);
  const acceptedTermsVersion =
    typeof parsed.body.termsVersion === "string" ? parsed.body.termsVersion.trim() : "";

  if (!name || name.length > 100 || !email || !validPassword(password)) {
    return NextResponse.json(
      { error: "Enter a valid name and email, and a password of at least 12 characters." },
      { status: 400 },
    );
  }
  if (!whatsappPhone) {
    return NextResponse.json(
      { error: "Enter a valid WhatsApp number with its country code, for example +923001234567." },
      { status: 400 },
    );
  }
  if (parsed.body.termsAccepted !== true || !acceptedTermsVersion || acceptedTermsVersion.length > 40) {
    return NextResponse.json(
      { error: "Review and accept the current Terms & Conditions before creating an account." },
      { status: 400 },
    );
  }

  try {
    await connectDB();
    if (await isMaintenanceMode()) {
      return NextResponse.json(
        { error: "Registration is temporarily paused for maintenance." },
        { status: 503 },
      );
    }
    const currentSettings = await PortalSettings.findOne({ key: "global" })
      .select("legalContent.termsVersion")
      .lean();
    const termsVersion = currentSettings?.legalContent?.termsVersion || DEFAULT_TERMS_VERSION;
    if (acceptedTermsVersion !== termsVersion) {
      return NextResponse.json(
        { error: "The Terms & Conditions changed. Reload the page and accept the current version." },
        { status: 409 },
      );
    }
    const rate = await consumeRateLimit(request, "register", {
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
        },
      );
    }

    const packageId = parsed.body.packageId;
    if (typeof packageId !== "string" || !/^[a-f\d]{24}$/i.test(packageId)) {
      return NextResponse.json({ error: "Select a registration package." }, { status: 400 });
    }

    const registrationPackage = await RegistrationPackage.findOne({
      _id: packageId,
      active: true,
      archivedAt: null,
      $or: [
        { eligibleReferralTiers: { $exists: false } },
        { eligibleReferralTiers: { $size: 0 } },
        { eligibleReferralTiers: "__unassigned__" },
      ],
    }).select("_id name description benefits priceMinor currency validityDays dailyEarningLimitMinor dailyTaskQuota dailyTaskLimit perTaskEarningsMinor minimumWithdrawalMinor maximumWithdrawalMinor withdrawalFeeBrackets");
    if (!registrationPackage) {
      return NextResponse.json(
        { error: "That registration package is unavailable." },
        { status: 400 },
      );
    }

    let referredBy = null;
    const submittedReferralCode =
      parsed.body.referralCode ??
      request.cookies.get("referral_code")?.value;
    if (submittedReferralCode !== undefined) {
      if (
        typeof submittedReferralCode !== "string" ||
        submittedReferralCode.length > 32
      ) {
        return NextResponse.json({ error: "Referral code is invalid." }, { status: 400 });
      }
      const referrer = await User.findOne({
        referralCode: submittedReferralCode.trim().toLowerCase(),
        role: "user",
        active: true,
        paymentStatus: "approved",
        deletedAt: null,
      }).select("_id");
      if (referrer) referredBy = referrer._id;
    }

    const existingUser = await User.exists({ email });
    if (existingUser) {
      return NextResponse.json({ error: "Unable to create an account with those details." }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const emailVerificationRequired = isEmailDeliveryConfigured();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const transactionSettings = await PortalSettings.findOne({ key: "global" })
          .select("legalContent.termsVersion")
          .session(session)
          .lean();
        if (
          (transactionSettings?.legalContent?.termsVersion || DEFAULT_TERMS_VERSION) !==
          acceptedTermsVersion
        ) {
          const error = new Error("The Terms & Conditions changed. Reload the page and accept the current version.");
          error.statusCode = 409;
          throw error;
        }
        const termsAcceptedAt = new Date();
        const [user] = await User.create(
          [{
            name,
            email,
            whatsappPhone,
            emailVerified: !emailVerificationRequired,
            emailVerifiedAt: emailVerificationRequired ? null : new Date(),
            password: hashedPassword,
            role: "user",
            active: false,
            paymentStatus: "pending",
            packageId: registrationPackage._id,
            packagePriceMinor: registrationPackage.priceMinor,
            packageCurrency: registrationPackage.currency,
            packageName: registrationPackage.name,
            packageDescription: registrationPackage.description || "",
            packageBenefits: registrationPackage.benefits || [],
            packageValidityDays: registrationPackage.validityDays || 30,
            packageDailyEarningLimitMinor: registrationPackage.dailyEarningLimitMinor || 0,
            packageDailyTaskQuota: registrationPackage.dailyTaskLimit ?? registrationPackage.dailyTaskQuota ?? 0,
            packageDailyTaskLimit: registrationPackage.dailyTaskLimit ?? registrationPackage.dailyTaskQuota ?? 0,
            packagePerTaskEarningsMinor: registrationPackage.perTaskEarningsMinor || 0,
            packageWithdrawalMinimumMinor: registrationPackage.minimumWithdrawalMinor ?? 100,
            packageWithdrawalMaximumMinor: registrationPackage.maximumWithdrawalMinor ?? null,
            packageWithdrawalFeeBrackets: registrationPackage.withdrawalFeeBrackets || [
              { minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 },
            ],
            termsAcceptedAt,
            termsVersion: acceptedTermsVersion,
            referralCode: randomBytes(8).toString("base64url").toLowerCase(),
            referredBy,
          }],
          { session },
        );

        if (referredBy) {
          await ReferralEvent.create(
            [{
              referrerId: referredBy,
              referredUserId: user._id,
              type: "registration",
            }],
            { session },
          );
          await User.updateOne(
            { _id: referredBy },
            { $inc: { referredUserCount: 1 } },
            { session },
          );
        }

        await TrafficEvent.create(
          [{
            type: "registration",
            path: "/",
            visitorHash: createHash("sha256")
              .update(request.headers.get("x-real-ip") || "")
              .digest("hex"),
          }],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json(
      {
        message: emailVerificationRequired
          ? "Account created. Verify your email before signing in."
          : "Account created. Sign in to submit your package payment proof.",
        verificationRequired: emailVerificationRequired,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error?.code === 11000) {
      return NextResponse.json({ error: "Unable to create an account with those details." }, { status: 409 });
    }
    console.error("User registration failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Account creation is temporarily unavailable." }, { status: 500 });
  }
}
