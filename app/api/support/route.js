import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { getActiveRequestUser } from "@/lib/request-auth";
import { writeAdminAudit } from "@/lib/audit";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import SupportTicket from "@/models/SupportTicket";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeTicket(item) {
  return {
    id: item._id.toString(),
    user: item.userId
      ? { name: item.userId.name, email: item.userId.email }
      : null,
    subject: item.subject,
    message: item.message,
    status: item.status,
    priority: item.priority,
    resolution: item.resolution,
    createdAt: item.createdAt.toISOString(),
  };
}

export async function GET(request) {
  try {
    const userAuth = await getActiveRequestUser(request);
    if (!userAuth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const staff = ["superAdmin", "helpAdmin", "moderator"].includes(userAuth.user.role);
    const filter = staff ? {} : { userId: userAuth.user._id };
    const tickets = await SupportTicket.find(filter)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return NextResponse.json({ tickets: tickets.map(serializeTicket) });
  } catch (error) {
    console.error("Loading support tickets failed:", error);
    return NextResponse.json({ error: "Could not load support tickets." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const subject = typeof parsed.body.subject === "string" ? parsed.body.subject.trim() : "";
  const message = typeof parsed.body.message === "string" ? parsed.body.message.trim() : "";
  if (!subject || subject.length > 160 || !message || message.length > 4000) {
    return NextResponse.json({ error: "Enter a subject and message." }, { status: 400 });
  }
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const rate = await consumeRateLimit(request, "support-create", {
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many support requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
      );
    }
    const [ticket] = await SupportTicket.create([
      { userId: auth.user._id, subject, message },
    ]);
    return NextResponse.json({ id: ticket._id.toString() }, { status: 201 });
  } catch (error) {
    console.error("Creating support ticket failed:", error);
    return NextResponse.json({ error: "Could not create support ticket." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { id, status, priority, resolution } = parsed.body;
  if (
    typeof id !== "string" ||
    !mongoose.isValidObjectId(id) ||
    new mongoose.Types.ObjectId(id).toString() !== id ||
    !["open", "inProgress", "resolved", "closed"].includes(status) ||
    (priority !== undefined && !["low", "normal", "high", "urgent"].includes(priority)) ||
    (resolution !== undefined &&
      (typeof resolution !== "string" || resolution.length > 2000))
  ) {
    return NextResponse.json({ error: "Invalid ticket update." }, { status: 400 });
  }
  try {
    const auth = await requireStaff(request, ["superAdmin", "helpAdmin", "moderator"]);
    if (auth.response) return auth.response;
    const update = {
      status,
      assignedTo: auth.user._id,
      resolution: resolution?.trim() || "",
    };
    if (priority) update.priority = priority;
    const ticket = await SupportTicket.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    await writeAdminAudit(request, auth, "support-ticket.updated", {
      type: "SupportTicket",
      id,
      metadata: { status, priority: priority || ticket.priority },
    });
    return NextResponse.json({ message: "Ticket updated." });
  } catch (error) {
    console.error("Updating support ticket failed:", error);
    return NextResponse.json({ error: "Could not update ticket." }, { status: 500 });
  }
}
