import { NextResponse } from "next/server";
import { getActiveRequestUser } from "@/lib/request-auth";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import ActiveSession from "@/models/ActiveSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const sessions = await ActiveSession.find({
      userId: auth.user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .select("jti userAgent ipAddress lastSeenAt createdAt")
      .sort({ lastSeenAt: -1 })
      .lean();
    return NextResponse.json({
      sessions: sessions.map((session) => ({
        id: session.jti,
        current: session.jti === auth.session.jti,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        lastSeenAt: session.lastSeenAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Loading active sessions failed:", error);
    return NextResponse.json({ error: "Could not load sessions." }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const query =
      parsed.body.all === true
        ? { userId: auth.user._id, revokedAt: null }
        : {
            userId: auth.user._id,
            jti: typeof parsed.body.id === "string" ? parsed.body.id : "",
            revokedAt: null,
          };
    if (parsed.body.all !== true && !query.jti) {
      return NextResponse.json({ error: "Choose a valid session." }, { status: 400 });
    }
    await ActiveSession.updateMany(query, { $set: { revokedAt: new Date() } });
    return NextResponse.json({ message: "Session(s) terminated." });
  } catch (error) {
    console.error("Terminating user sessions failed:", error);
    return NextResponse.json({ error: "Could not terminate sessions." }, { status: 500 });
  }
}
