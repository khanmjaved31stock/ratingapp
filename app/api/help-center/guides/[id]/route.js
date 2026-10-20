import mongoose from "mongoose";
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { serializeGuide, validateGuidePayload } from "@/lib/help-center";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import AdminAuditLog from "@/models/AdminAuditLog";
import HelpCenterCategory from "@/models/HelpCenterCategory";
import HelpGuide from "@/models/HelpGuide";
import HelpGuideVersion from "@/models/HelpGuideVersion";
import PortalSettings from "@/models/PortalSettings";
import { getHelpTimeZone } from "@/lib/help-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeSnapshot(guide) {
  const snapshot = guide.toObject();
  delete snapshot.__v;
  return snapshot;
}

export async function GET(request, { params }) {
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Guide not found." }, { status: 404 });
    await connectDB();
    const guide = await HelpGuide.findById(id).populate("categoryId", "name slug");
    if (!guide) return NextResponse.json({ error: "Guide not found." }, { status: 404 });
    const settings = await PortalSettings.findOne({ key: "global" }).select("businessTimeZone").lean();
    const timeZone = getHelpTimeZone(settings?.businessTimeZone || "UTC");
    const [versions, audits] = await Promise.all([
      HelpGuideVersion.find({ guideId: id })
      .populate("actorId", "name")
      .sort({ version: -1 })
      .limit(50)
      .lean(),
      AdminAuditLog.find({ targetType: "HelpGuide", targetId: id })
        .populate("actorId", "name")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    ]);
    return NextResponse.json({
      guide: serializeGuide(guide, { includeAssets: true, timeZone }),
      versions: versions.map((item) => ({
        version: item.version,
        title: item.snapshot?.title || "",
        summary: item.snapshot?.summary || "",
        visibility: item.snapshot?.visibility || "",
        status: item.snapshot?.status || "",
        paragraphs: item.snapshot?.paragraphs || [],
        steps: item.snapshot?.steps || [],
        updateNote: item.updateNote,
        actor: item.actorId?.name || "Administrator",
        actorRole: item.actorRole,
        createdAt: item.createdAt?.toISOString() || "",
      })),
      audits: audits.map((item) => ({
        action: item.action,
        actor: item.actorId?.name || "Administrator",
        actorRole: item.actorRole,
        metadata: item.metadata || {},
        createdAt: item.createdAt?.toISOString() || "",
      })),
      timeZone,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Loading Help Center guide history failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not load guide history." }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = await readJsonBody(request, { maxBytes: 64 * 1024 });
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Guide not found." }, { status: 404 });
  let session;
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    await connectDB();
    const settings = await PortalSettings.findOne({ key: "global" }).select("businessTimeZone").lean();
    const timeZone = getHelpTimeZone(settings?.businessTimeZone || "UTC");
    const validation = validateGuidePayload(parsed.body, { timeZone });
    if (validation.error) return NextResponse.json({ error: validation.error }, { status: 400 });
    if (!await HelpCenterCategory.exists({ _id: validation.data.categoryId })) {
      return NextResponse.json({ error: "The selected category does not exist." }, { status: 400 });
    }
    if (validation.data.relatedGuideIds.some((relatedId) => relatedId.toString() === id)) {
      return NextResponse.json({ error: "A guide cannot be related to itself." }, { status: 400 });
    }
    if (
      validation.data.relatedGuideIds.length &&
      await HelpGuide.countDocuments({ _id: { $in: validation.data.relatedGuideIds } }) !== validation.data.relatedGuideIds.length
    ) return NextResponse.json({ error: "One or more related guides do not exist." }, { status: 400 });
    session = await mongoose.startSession();
    let saved;
    await session.withTransaction(async () => {
      const current = await HelpGuide.findById(id).session(session);
      if (!current) throw Object.assign(new Error("Guide not found."), { status: 404 });
      current.set({
        ...validation.data,
        publishedAt: validation.data.status === "published"
          ? current.status === "published" && current.publishedAt ? current.publishedAt : new Date()
          : validation.data.status === "scheduled" ? validation.data.publishAt : null,
        version: current.version + 1,
        updatedBy: auth.user._id,
      });
      saved = await current.save({ session, validateBeforeSave: true });
      await HelpGuideVersion.create([{
        guideId: saved._id,
        version: saved.version,
        snapshot: safeSnapshot(saved),
        updateNote: saved.updateNote,
        actorId: auth.user._id,
        actorRole: "superAdmin",
      }], { session });
      await writeAdminAudit(request, auth, `help-guide.${saved.status}`, {
        type: "HelpGuide",
        id,
        metadata: { slug: saved.slug, visibility: saved.visibility, status: saved.status, version: saved.version },
        session,
      });
    });
    await saved.populate("categoryId", "name slug");
    return NextResponse.json({ guide: serializeGuide(saved, { includeAssets: true, timeZone }) });
  } catch (error) {
    if (error?.code === 11000) return NextResponse.json({ error: "That guide URL is already in use." }, { status: 409 });
    if (error?.status === 404) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("Updating Help Center guide failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not update the Help Center guide." }, { status: 500 });
  } finally {
    if (session) await session.endSession();
  }
}
