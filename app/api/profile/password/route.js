import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { isSameOriginRequest, readJsonBody, validPassword } from "@/lib/request";
import { getActiveRequestUser } from "@/lib/request-auth";
import User from "@/models/User";
import ActiveSession from "@/models/ActiveSession";
import { consumeRateLimit } from "@/lib/rate-limit";
import { writeAdminAudit, writeSecurityEvent } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { currentPassword, newPassword } = parsed.body;
  if (typeof currentPassword !== "string" || !validPassword(newPassword)) {
    return NextResponse.json({ error: "Enter your current password and a valid new password." }, { status: 400 });
  }
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const rate = await consumeRateLimit(request, `password-change:${auth.user.role}`, {
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many password change attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
      );
    }
    const user = await User.findById(auth.user._id).select("+password");
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
    const password = await bcrypt.hash(newPassword, 12);
    await User.updateOne(
      { _id: user._id },
      { $set: { password }, $inc: { sessionVersion: 1 } },
    );
    await ActiveSession.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    if (auth.user.role !== "user") {
      await writeAdminAudit(request, auth, "admin.password-changed", {
        type: "User",
        id: user._id.toString(),
      });
    }
    await writeSecurityEvent(request, {
      type: "passwordChanged",
      userId: user._id,
      email: user.email,
      details: "Account password changed; active sessions revoked.",
    });
    const response = NextResponse.json({ message: "Password updated. Sign in again." });
    response.cookies.set("rating_portal_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error("Changing password failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not update password." }, { status: 500 });
  }
}
