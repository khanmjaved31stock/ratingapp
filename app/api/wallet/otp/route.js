import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { getActiveRequestUser } from "@/lib/request-auth";
import WithdrawalOtp from "@/models/WithdrawalOtp";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import { hashEmailCode, isEmailDeliveryConfigured, matchesEmailCode, sendAccountEmail } from "@/lib/auth-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { action, code } = parsed.body;
  if (!["send", "verify"].includes(action) || (action === "verify" && !/^\d{6}$/.test(code || ""))) {
    return NextResponse.json({ error: "Enter a valid verification action and six-digit code." }, { status: 400 });
  }

  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user" || auth.user.paymentStatus !== "approved") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const rate = await consumeRateLimit(
      request,
      action === "send" ? "withdrawal-otp-send" : "withdrawal-otp-verify",
      { limit: action === "send" ? 3 : 10, windowMs: 60 * 60 * 1000 },
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
      );
    }

    if (action === "send") {
      if (!isEmailDeliveryConfigured()) {
        return NextResponse.json({ error: "Email verification is not configured. Contact support before requesting a withdrawal." }, { status: 503 });
      }
      const challenge = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await WithdrawalOtp.findOneAndUpdate(
        { userId: auth.user._id },
        {
          $set: {
            sessionJti: auth.session.jti,
            codeHash: hashEmailCode(auth.user._id.toString(), challenge),
            attempts: 0,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            verifiedUntil: null,
            consumedAt: null,
          },
        },
        { upsert: true, new: true, runValidators: true },
      );
      await sendAccountEmail({
        to: auth.user.email,
        subject: "Your Ratewell withdrawal verification code",
        text: `Your withdrawal verification code is ${challenge}. It expires in 10 minutes. If you did not request this code, secure your Ratewell account.`,
      });
      return NextResponse.json({ message: "A verification code was sent to your account email." });
    }

    const challenge = await WithdrawalOtp.findOne({
      userId: auth.user._id,
      sessionJti: auth.session.jti,
      expiresAt: { $gt: new Date() },
      consumedAt: null,
      verifiedUntil: null,
      attempts: { $lt: 5 },
    }).select("+codeHash");
    if (!challenge) {
      return NextResponse.json({ error: "Request a new verification code and try again." }, { status: 409 });
    }
    if (!matchesEmailCode(challenge.codeHash, auth.user._id.toString(), code)) {
      await WithdrawalOtp.updateOne(
        { _id: challenge._id, attempts: { $lt: 5 } },
        { $inc: { attempts: 1 } },
      );
      return NextResponse.json({ error: "That verification code is incorrect or expired." }, { status: 400 });
    }
    challenge.verifiedUntil = new Date(Date.now() + 10 * 60 * 1000);
    await challenge.save();
    return NextResponse.json({ message: "Email verified. Submit your withdrawal within 10 minutes." });
  } catch (error) {
    console.error("Withdrawal email verification failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Email verification is temporarily unavailable." }, { status: 500 });
  }
}
