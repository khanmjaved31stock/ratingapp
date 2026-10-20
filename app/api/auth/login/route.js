import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import BlockedIp from "@/models/BlockedIp";
import { createSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { isSameOriginRequest, normalizeEmail, readJsonBody } from "@/lib/request";
import { consumeRateLimit } from "@/lib/rate-limit";
import { writeSecurityEvent } from "@/lib/audit";
import { getRequestIp } from "@/lib/request-ip";
import { isMaintenanceMode } from "@/lib/maintenance";
import { isEmailVerified } from "@/lib/email-verification";

export const runtime = "nodejs";

const DUMMY_HASH = "$2a$12$MjmpDC62lpRFUf7N.nL9R.0H65iAnaogusRH90AU/EbZPJQAxLRHe";
const ALLOWED_ROLES = ["user", "superAdmin", "helpAdmin", "moderator"];

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const parsed = await readJsonBody(request);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const email = normalizeEmail(parsed.body.email);
  const password = parsed.body.password;
  const role = parsed.body.role;
  const rememberMe = parsed.body.rememberMe === true;

  if (
    !email ||
    typeof password !== "string" ||
    password.length > 128 ||
    new TextEncoder().encode(password).byteLength > 72 ||
    !ALLOWED_ROLES.includes(role) ||
    (parsed.body.rememberMe !== undefined && typeof parsed.body.rememberMe !== "boolean")
  ) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
  }

  try {
    await connectDB();
    const ipAddress = getRequestIp(request);
    const blockedIp = await BlockedIp.exists({
      address: ipAddress,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (blockedIp) {
      return NextResponse.json(
        { error: "Sign-in is unavailable from this network." },
        { status: 403 },
      );
    }

    const rate = await consumeRateLimit(request, "login", {
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
        },
      );
    }

    const accountRate = await consumeRateLimit(request, "login-account", {
      limit: 10,
      windowMs: 15 * 60 * 1000,
      identity: email,
    });
    if (!accountRate.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(accountRate.retryAfterMs / 1000)) },
        },
      );
    }

    const user = await User.findOne({ email }).select("+password");
    const passwordMatches = await bcrypt.compare(
      password,
      user?.password || DUMMY_HASH,
    );

    const pendingPayment =
      user?.role === "user" &&
      user?.paymentStatus === "pending" &&
      !user?.suspended;
    if (
      !user ||
      user.suspended ||
      !isEmailVerified(user) ||
      (!user.active && !pendingPayment) ||
      user.role !== role ||
      !passwordMatches
    ) {
      await writeSecurityEvent(request, {
        type: "loginFailed",
        email,
        userId: user?._id || null,
        details: "Invalid credentials, disabled account, or role mismatch.",
      });
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    if (role === "user" && (await isMaintenanceMode())) {
      return NextResponse.json(
        { error: "The user portal is temporarily under maintenance. Please try again later." },
        { status: 503 },
      );
    }

    const token = await createSession(user, {
      ipAddress,
      userAgent: request.headers.get("user-agent") || "",
      rememberMe: role === "user" && rememberMe,
    });
    const nextPath = pendingPayment
      ? "/dashboard/payment"
      : role === "user"
        ? "/dashboard"
        : role === "superAdmin"
          ? "/super-admin/dashboard"
          : role === "helpAdmin"
            ? "/help-admin/dashboard"
            : "/moderator/dashboard";
    const response = NextResponse.json({ message: "Signed in.", nextPath });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(role === "user" && rememberMe));
    await writeSecurityEvent(request, {
      type: "loginSucceeded",
      email,
      userId: user._id,
      details: `Successful ${role} sign-in.`,
    });
    return response;
  } catch (error) {
    console.error("Sign-in failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 500 });
  }
}
