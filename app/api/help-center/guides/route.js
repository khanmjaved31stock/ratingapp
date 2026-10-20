import mongoose from "mongoose";
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { ensureHelpCategories, escapeRegExp, serializeGuide, validateGuidePayload } from "@/lib/help-center";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import HelpCenterCategory from "@/models/HelpCenterCategory";
import HelpGuide from "@/models/HelpGuide";
import HelpGuideFeedback from "@/models/HelpGuideFeedback";
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

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    await connectDB();
    await ensureHelpCategories();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
    const status = url.searchParams.get("status") || "";
    const categoryId = url.searchParams.get("categoryId") || "";
    const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
    const limit = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20));
    if (status && !["draft", "scheduled", "published", "archived"].includes(status)) {
      return NextResponse.json({ error: "Invalid guide filter." }, { status: 400 });
    }
    if (categoryId && !mongoose.isValidObjectId(categoryId)) {
      return NextResponse.json({ error: "Invalid category filter." }, { status: 400 });
    }
    const filter = {};
    if (status) filter.status = status;
    if (categoryId) filter.categoryId = categoryId;
    if (q) {
      const pattern = new RegExp(escapeRegExp(q), "i");
      filter.$or = [{ title: pattern }, { summary: pattern }, { tags: pattern }];
    }
    const [items, total, categories, settings] = await Promise.all([
      HelpGuide.find(filter).populate("categoryId", "name slug")
        .sort({ sortOrder: 1, updatedAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      HelpGuide.countDocuments(filter),
      HelpCenterCategory.find().sort({ sortOrder: 1, name: 1 }).lean(),
      PortalSettings.findOne({ key: "global" }).select("businessTimeZone").lean(),
    ]);
    const feedbackStats = items.length
      ? await HelpGuideFeedback.aggregate([
          { $match: { guideId: { $in: items.map((item) => item._id) } } },
          { $group: { _id: "$guideId", helpful: { $sum: { $cond: [{ $and: [{ $eq: ["$kind", "helpful"] }, { $eq: ["$helpful", true] }] }, 1, 0] } }, issues: { $sum: { $cond: [{ $eq: ["$kind", "issue"] }, 1, 0] } } } },
        ])
      : [];
    const timeZone = getHelpTimeZone(settings?.businessTimeZone || "UTC");
    const stats = new Map(feedbackStats.map((row) => [row._id.toString(), { helpful: row.helpful, issues: row.issues }]));
    return NextResponse.json({
      guides: items.map((item) => ({
        ...serializeGuide(item, { includeAssets: true, timeZone }),
        stats: stats.get(item._id.toString()) || { helpful: 0, issues: 0 },
      })),
      categories: categories.map((item) => ({ id: item._id.toString(), name: item.name, slug: item.slug, active: item.active, sortOrder: item.sortOrder })),
      timeZone,
      page,
      pages: Math.ceil(total / limit),
      total,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Loading administrator guides failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not load Help Center guides." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = await readJsonBody(request, { maxBytes: 64 * 1024 });
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  let session;
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    await connectDB();
    const settings = await PortalSettings.findOne({ key: "global" }).select("businessTimeZone").lean();
    const timeZone = getHelpTimeZone(settings?.businessTimeZone || "UTC");
    const validation = validateGuidePayload(parsed.body, { timeZone });
    if (validation.error) return NextResponse.json({ error: validation.error }, { status: 400 });
    const category = await HelpCenterCategory.exists({ _id: validation.data.categoryId });
    if (!category) return NextResponse.json({ error: "The selected category does not exist." }, { status: 400 });
    if (
      validation.data.relatedGuideIds.length &&
      await HelpGuide.countDocuments({ _id: { $in: validation.data.relatedGuideIds } }) !== validation.data.relatedGuideIds.length
    ) return NextResponse.json({ error: "One or more related guides do not exist." }, { status: 400 });
    session = await mongoose.startSession();
    let guide;
    await session.withTransaction(async () => {
      [guide] = await HelpGuide.create([{
        ...validation.data,
        version: 1,
        createdBy: auth.user._id,
        updatedBy: auth.user._id,
      }], { session });
      await HelpGuideVersion.create([{
        guideId: guide._id,
        version: 1,
        snapshot: safeSnapshot(guide),
        updateNote: validation.data.updateNote,
        actorId: auth.user._id,
        actorRole: "superAdmin",
      }], { session });
      await writeAdminAudit(request, auth, "help-guide.created", {
        type: "HelpGuide",
        id: guide._id.toString(),
        metadata: { slug: guide.slug, visibility: guide.visibility, status: guide.status },
        session,
      });
    });
    await guide.populate("categoryId", "name slug");
    return NextResponse.json({ guide: serializeGuide(guide, { includeAssets: true, timeZone }) }, { status: 201 });
  } catch (error) {
    if (error?.code === 11000) return NextResponse.json({ error: "That guide URL is already in use." }, { status: 409 });
    console.error("Creating Help Center guide failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not create the Help Center guide." }, { status: 500 });
  } finally {
    if (session) await session.endSession();
  }
}
