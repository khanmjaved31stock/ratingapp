import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ActiveSession from "@/models/ActiveSession";
import PasswordResetOtp from "@/models/PasswordResetOtp";
import SecurityEvent from "@/models/SecurityEvent";
import User from "@/models/User";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { isSameOriginRequest, normalizeEmail, readJsonBody } from "@/lib/request";
import { hashEmailCode, isEmailDeliveryConfigured, matchesEmailCode, sendAccountEmail } from "@/lib/auth-email";
import { isEmailVerified } from "@/lib/email-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_SEND_MESSAGE = "If an eligible account needs verification, a code will be sent to its email.";
const INVALID_CODE_MESSAGE = "The code is invalid or expired. Request a new one and try again.";

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const email = normalizeEmail(parsed.body.email);
  const { action, code } = parsed.body;
  if (!email || !["send", "verify"].includes(action) ||
    (action === "verify" && !/^\d{6}$/.test(code || ""))) {
    return NextResponse.json({ error: "Enter a valid email and verification code." }, { status: 400 });
  }

  try {
    await connectDB();
    const ipRate = await consumeRateLimit(request, `email-verification-${action}`, {
      limit: action === "send" ? 5 : 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!ipRate.allowed) {
      return NextResponse.json(
        { error: "Too many verification requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(ipRate.retryAfterMs / 1000)) } },
      );
    }
    const accountRate = await consumeRateLimit(request, `email-verification-${action}-account`, {
      limit: action === "send" ? 3 : 10,
      windowMs: 60 * 60 * 1000,
      identity: email,
    });
    if (!accountRate.allowed) {
      return NextResponse.json(
        { error: "Too many verification requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(accountRate.retryAfterMs / 1000)) } },
      );
    }

    const user = await User.findOne({
      email,
      role: "user",
      paymentStatus: "pending",
      deletedAt: null,
      suspended: { $ne: true },
    }).select("_id email emailVerified");

    if (action === "send") {
      if (!isEmailDeliveryConfigured()) {
        return NextResponse.json({ error: "Email verification is not configured. Contact support." }, { status: 503 });
      }
      if (!user || isEmailVerified(user)) return NextResponse.json({ message: GENERIC_SEND_MESSAGE });
      const challenge = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await PasswordResetOtp.findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            codeHash: hashEmailCode(user._id.toString(), challenge),
            purpose: "emailVerification",
            attempts: 0,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            consumedAt: null,
          },
        },
        { upsert: true, new: true, runValidators: true },
      );
      await sendAccountEmail({
        to: user.email,
        subject: "Verify your Ratewell email",
        text: `Your Ratewell email verification code is ${challenge}. It expires in 10 minutes. If you did not create this account, you can ignore this email.`,
      });
      return NextResponse.json({ message: GENERIC_SEND_MESSAGE });
    }

    if (!user || isEmailVerified(user)) {
      return NextResponse.json({ error: INVALID_CODE_MESSAGE }, { status: 400 });
    }
    const challenge = await PasswordResetOtp.findOne({
      userId: user._id,
      purpose: "emailVerification",
      expiresAt: { $gt: new Date() },
      consumedAt: null,
      attempts: { $lt: 5 },
    }).select("+codeHash");
    if (!challenge) return NextResponse.json({ error: INVALID_CODE_MESSAGE }, { status: 400 });
    if (!matchesEmailCode(challenge.codeHash, user._id.toString(), code)) {
      await PasswordResetOtp.updateOne(
        { _id: challenge._id, attempts: { $lt: 5 } },
        { $inc: { attempts: 1 } },
      );
      return NextResponse.json({ error: INVALID_CODE_MESSAGE }, { status: 400 });
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const consumed = await PasswordResetOtp.findOneAndUpdate(
          {
            _id: challenge._id,
            userId: user._id,
            purpose: "emailVerification",
            codeHash: challenge.codeHash,
            expiresAt: { $gt: new Date() },
            consumedAt: null,
            attempts: { $lt: 5 },
          },
          { $set: { consumedAt: new Date() } },
          { new: true, session },
        );
        if (!consumed) {
          const error = new Error(INVALID_CODE_MESSAGE);
          error.statusCode = 400;
          throw error;
        }
        const verifiedAt = new Date();
        const updated = await User.updateOne(
          { _id: user._id, role: "user", paymentStatus: "pending", emailVerified: false, suspended: { $ne: true } },
          { $set: { emailVerified: true, emailVerifiedAt: verifiedAt } },
          { session },
        );
        if (updated.modifiedCount !== 1) {
          const error = new Error(INVALID_CODE_MESSAGE);
          error.statusCode = 400;
          throw error;
        }
        await SecurityEvent.create(
          [{
            type: "emailVerified",
            email: user.email,
            userId: user._id,
            ipAddress: getRequestIp(request),
            userAgent: request.headers.get("user-agent") || "",
            details: "User verified the registration email using a time-limited code.",
          }],
          { session },
        );
        await ActiveSession.updateMany(
          { userId: user._id, revokedAt: null },
          { $set: { revokedAt: verifiedAt } },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ message: "Email verified. You can now sign in and continue registration." });
  } catch (error) {
    if (error.statusCode) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Registration email verification failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Email verification is temporarily unavailable." }, { status: 500 });
  }
}
