import mongoose from "mongoose";
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireStaff } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import HelpGuideFeedback from "@/models/HelpGuideFeedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await requireStaff(request, ["superAdmin", "helpAdmin"]);
    if (auth.response) return auth.response;
    await connectDB();
    const url = new URL(request.url);
    const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
    const limit = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20));
    const kind = url.searchParams.get("kind") || "";
    const status = url.searchParams.get("status") || "";
    if (kind && !["helpful", "issue"].includes(kind)) return NextResponse.json({ error: "Invalid feedback filter." }, { status: 400 });
    if (status && !["open", "reviewing", "resolved"].includes(status)) return NextResponse.json({ error: "Invalid feedback status." }, { status: 400 });
    const filter = { ...(kind ? { kind } : {}), ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([
      HelpGuideFeedback.find(filter)
        .populate("guideId", "title slug")
        .populate("userId", "name")
        .populate("reviewedBy", "name")
        .sort({ status: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      HelpGuideFeedback.countDocuments(filter),
    ]);
    return NextResponse.json({
      feedback: items.map((item) => ({
        id: item._id.toString(),
        guide: item.guideId ? { title: item.guideId.title, slug: item.guideId.slug } : null,
        user: item.userId?.name || "Visitor",
        kind: item.kind,
        helpful: item.helpful,
        message: item.message,
        status: item.status,
        reviewedBy: item.reviewedBy?.name || "",
        createdAt: item.createdAt?.toISOString() || "",
        resolvedAt: item.resolvedAt?.toISOString() || "",
      })),
      page,
      pages: Math.ceil(total / limit),
      total,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Loading Help Center review queue failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not load Help Center reports." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { id, status } = parsed.body;
  if (!mongoose.isValidObjectId(id) || !["open", "reviewing", "resolved"].includes(status)) {
    return NextResponse.json({ error: "Invalid Help Center report update." }, { status: 400 });
  }
  try {
    const auth = await requireStaff(request, ["superAdmin", "helpAdmin"]);
    if (auth.response) return auth.response;
    await connectDB();
    const session = await mongoose.startSession();
    let feedback;
    try {
      await session.withTransaction(async () => {
        feedback = await HelpGuideFeedback.findByIdAndUpdate(
          id,
          {
            $set: {
              status,
              reviewedBy: auth.user._id,
              resolvedAt: status === "resolved" ? new Date() : null,
            },
          },
          { new: true, runValidators: true, session },
        );
        if (!feedback) throw Object.assign(new Error("Help Center report not found."), { status: 404 });
        await writeAdminAudit(request, auth, "help-guide-feedback.updated", {
          type: "HelpGuideFeedback",
          id,
          metadata: { status, kind: feedback.kind },
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ message: "Help Center report updated." });
  } catch (error) {
    if (error?.status === 404) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("Updating Help Center review item failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not update Help Center report." }, { status: 500 });
  }
}
