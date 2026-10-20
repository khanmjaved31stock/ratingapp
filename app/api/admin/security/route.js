import { isIP } from "node:net";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import BlockedIp from "@/models/BlockedIp";
import SecurityEvent from "@/models/SecurityEvent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const [blockedIps, events] = await Promise.all([
      BlockedIp.find({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
        .populate("blockedBy", "name email")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      SecurityEvent.find().sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    return NextResponse.json({
      blockedIps: blockedIps.map((item) => ({
        id: item._id.toString(),
        address: item.address,
        reason: item.reason,
        blockedBy: item.blockedBy?.name || "Former administrator",
        expiresAt: item.expiresAt?.toISOString() || null,
        createdAt: item.createdAt.toISOString(),
      })),
      events: events.map((item) => ({
        id: item._id.toString(),
        type: item.type,
        email: item.email,
        ipAddress: item.ipAddress,
        details: item.details,
        createdAt: item.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Loading security center failed:", error);
    return NextResponse.json({ error: "Could not load security center." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const address = typeof parsed.body.address === "string" ? parsed.body.address.trim() : "";
  const reason = typeof parsed.body.reason === "string" ? parsed.body.reason.trim() : "";
  const expiresAt =
    parsed.body.expiresAt === null || parsed.body.expiresAt === undefined
      ? null
      : new Date(parsed.body.expiresAt);
  if (
    isIP(address) === 0 ||
    !reason ||
    reason.length > 300 ||
    (expiresAt && Number.isNaN(expiresAt.getTime()))
  ) {
    return NextResponse.json({ error: "Enter a valid IP address and reason." }, { status: 400 });
  }
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const item = await BlockedIp.findOneAndUpdate(
      { address },
      { $set: { reason, blockedBy: auth.user._id, expiresAt } },
      { upsert: true, new: true, runValidators: true },
    );
    await writeAdminAudit(request, auth, "security.ip-blocked", {
      type: "BlockedIp",
      id: item._id.toString(),
      metadata: { reason, expiresAt: expiresAt?.toISOString() || null },
    });
    return NextResponse.json({ id: item._id.toString() }, { status: 201 });
  } catch (error) {
    console.error("Blocking IP address failed:", error);
    return NextResponse.json({ error: "Could not block IP address." }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (
    typeof parsed.body.id !== "string" ||
    !mongoose.isValidObjectId(parsed.body.id) ||
    new mongoose.Types.ObjectId(parsed.body.id).toString() !== parsed.body.id
  ) {
    return NextResponse.json({ error: "Invalid IP block identifier." }, { status: 400 });
  }
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const result = await BlockedIp.findByIdAndDelete(parsed.body.id);
    if (!result) return NextResponse.json({ error: "IP block not found." }, { status: 404 });
    await writeAdminAudit(request, auth, "security.ip-unblocked", {
      type: "BlockedIp",
      id: result._id.toString(),
      metadata: { address: result.address },
    });
    return NextResponse.json({ message: "IP address unblocked." });
  } catch (error) {
    console.error("Removing IP block failed:", error);
    return NextResponse.json({ error: "Could not remove IP block." }, { status: 500 });
  }
}
