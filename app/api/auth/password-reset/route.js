import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { isSameOriginRequest, normalizeEmail, readJsonBody, validPassword } from "@/lib/request";
import { hashEmailCode, isEmailDeliveryConfigured, matchesEmailCode, sendAccountEmail } from "@/lib/auth-email";
import ActiveSession from "@/models/ActiveSession";
import PasswordResetOtp from "@/models/PasswordResetOtp";
import SecurityEvent from "@/models/SecurityEvent";
import User from "@/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_SEND_MESSAGE = "If an eligible account exists, a password reset code will be sent to its email.";

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const email = normalizeEmail(parsed.body.email);
  const { action, code, password } = parsed.body;
  if (
    !email ||
    !["send", "reset"].includes(action) ||
    (action === "reset" && (!/^\d{6}$/.test(code || "") || !validPassword(password)))
  ) {
    return NextResponse.json({ error: "Enter a valid email, reset code, and password of at least 12 characters." }, { status: 400 });
  }

  try {
    await connectDB();
    const rate = await consumeRateLimit(
      request,
      action === "send" ? "password-reset-send" : "password-reset-submit",
      { limit: action === "send" ? 3 : 10, windowMs: 60 * 60 * 1000 },
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many password reset requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
      );
    }
    const accountRate = await consumeRateLimit(
      request,
      action === "send" ? "password-reset-send-account" : "password-reset-submit-account",
      {
        limit: action === "send" ? 3 : 10,
        windowMs: 60 * 60 * 1000,
        identity: email,
      },
    );
    if (!accountRate.allowed) {
      return NextResponse.json(
        { error: "Too many password reset requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(accountRate.retryAfterMs / 1000)) } },
      );
    }

    const user = await User.findOne({ email, role: "user", active: true, deletedAt: null }).select("_id email");
    if (action === "send") {
      if (!isEmailDeliveryConfigured()) {
        return NextResponse.json({ error: "Password reset email is not configured. Contact support." }, { status: 503 });
      }
      if (!user) return NextResponse.json({ message: GENERIC_SEND_MESSAGE });
      const challenge = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await PasswordResetOtp.findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            codeHash: hashEmailCode(user._id.toString(), challenge),
            purpose: "passwordReset",
            attempts: 0,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            consumedAt: null,
          },
        },
        { upsert: true, new: true, runValidators: true },
      );
      await sendAccountEmail({
        to: user.email,
        subject: "Your Ratewell password reset code",
        text: `Your password reset code is ${challenge}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      });
      return NextResponse.json({ message: GENERIC_SEND_MESSAGE });
    }

    if (!user) return NextResponse.json({ error: "The code is invalid or expired. Request a new one and try again." }, { status: 400 });
    const challenge = await PasswordResetOtp.findOne({
      userId: user._id,
      $or: [{ purpose: "passwordReset" }, { purpose: { $exists: false } }],
      expiresAt: { $gt: new Date() },
      consumedAt: null,
      attempts: { $lt: 5 },
    }).select("+codeHash");
    if (!challenge) {
      return NextResponse.json({ error: "The code is invalid or expired. Request a new one and try again." }, { status: 400 });
    }
    if (!matchesEmailCode(challenge.codeHash, user._id.toString(), code)) {
      await PasswordResetOtp.updateOne(
        { _id: challenge._id, attempts: { $lt: 5 } },
        { $inc: { attempts: 1 } },
      );
      return NextResponse.json({ error: "The code is invalid or expired. Request a new one and try again." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const consumed = await PasswordResetOtp.findOneAndUpdate(
          {
            _id: challenge._id,
            userId: user._id,
            $or: [{ purpose: "passwordReset" }, { purpose: { $exists: false } }],
            codeHash: challenge.codeHash,
            expiresAt: { $gt: new Date() },
            consumedAt: null,
            attempts: { $lt: 5 },
          },
          { $set: { consumedAt: new Date() } },
          { new: true, session },
        );
        if (!consumed) {
          const error = new Error("The code is invalid or expired. Request a new one and try again.");
          error.statusCode = 400;
          throw error;
        }
        const updated = await User.updateOne(
          { _id: user._id, active: true, deletedAt: null, role: "user" },
          { $set: { password: passwordHash }, $inc: { sessionVersion: 1 } },
          { session },
        );
        if (updated.modifiedCount !== 1) {
          const error = new Error("This account cannot be reset. Contact support.");
          error.statusCode = 409;
          throw error;
        }
        await ActiveSession.updateMany(
          { userId: user._id, revokedAt: null },
          { $set: { revokedAt: new Date() } },
          { session },
        );
        await SecurityEvent.create(
          [{
            type: "passwordResetSucceeded",
            email: user.email,
            userId: user._id,
            ipAddress: getRequestIp(request),
            userAgent: request.headers.get("user-agent") || "",
            details: "User reset their password using a time-limited email code.",
          }],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ message: "Password reset. Sign in with your new password." });
  } catch (error) {
    if (error.statusCode) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Password reset request failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 500 });
  }
}
