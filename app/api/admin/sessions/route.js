import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import ActiveSession from "@/models/ActiveSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const sessions = await ActiveSession.find({
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .populate("userId", "name email role")
      .sort({ lastSeenAt: -1 })
      .limit(200)
      .lean();
    return NextResponse.json({
      sessions: sessions
        .filter((item) => item.userId)
        .map((item) => ({
          id: item.jti,
          userId: item.userId._id.toString(),
          name: item.userId.name,
          email: item.userId.email,
          role: item.userId.role,
          ipAddress: item.ipAddress,
          userAgent: item.userAgent,
          lastSeenAt: item.lastSeenAt.toISOString(),
          activeNow: item.lastSeenAt.getTime() > Date.now() - 5 * 60 * 1000,
        })),
    });
  } catch (error) {
    console.error("Loading admin sessions failed:", error);
    return NextResponse.json({ error: "Could not load sessions." }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const jti = parsed.body.id;
  if (typeof jti !== "string" || jti.length > 64) {
    return NextResponse.json({ error: "Invalid session identifier." }, { status: 400 });
  }
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const result = await ActiveSession.updateOne(
      { jti, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    await writeAdminAudit(request, auth, "session.revoked", {
      type: "ActiveSession",
      id: jti,
    });
    return NextResponse.json({ message: "Session terminated." });
  } catch (error) {
    console.error("Revoking admin session failed:", error);
    return NextResponse.json({ error: "Could not terminate session." }, { status: 500 });
  }
}
