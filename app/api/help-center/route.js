import mongoose from "mongoose";
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { getActiveRequestUser } from "@/lib/request-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { ensureHelpCategories, escapeRegExp, publicGuideFilter, serializeGuide } from "@/lib/help-center";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import HelpCenterCategory from "@/models/HelpCenterCategory";
import HelpGuide from "@/models/HelpGuide";
import HelpGuideFeedback from "@/models/HelpGuideFeedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request) {
  try {
    await connectDB();
    await ensureHelpCategories();
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    if (slug) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 180) {
        return NextResponse.json({ error: "Guide not found." }, { status: 404, headers: cacheHeaders });
      }
      const filter = { ...publicGuideFilter(), slug };
      const viewLimit = await consumeRateLimit(request, "help-guide-view", {
        limit: 120,
        windowMs: 15 * 60 * 1000,
      });
      const guideQuery = viewLimit.allowed
        ? HelpGuide.findOneAndUpdate(filter, { $inc: { views: 1 } }, { new: true, timestamps: false })
        : HelpGuide.findOne(filter);
      const guide = await guideQuery.populate("categoryId", "name slug").lean();
      if (!guide) return NextResponse.json({ error: "Guide not found." }, { status: 404, headers: cacheHeaders });

      const related = guide.relatedGuideIds?.length
        ? await HelpGuide.find({
            ...publicGuideFilter(),
            _id: { $in: guide.relatedGuideIds },
          })
            .populate("categoryId", "name slug")
            .sort({ featured: -1, sortOrder: 1, publishedAt: -1 })
            .limit(8)
            .lean()
        : [];
      const feedback = await HelpGuideFeedback.aggregate([
        { $match: { guideId: guide._id, kind: "helpful" } },
        { $group: { _id: "$helpful", count: { $sum: 1 } } },
      ]);
      const stats = { helpful: 0, notHelpful: 0 };
      for (const result of feedback) {
        if (result._id === true) stats.helpful = result.count;
        if (result._id === false) stats.notHelpful = result.count;
      }
      return NextResponse.json({
        guide: serializeGuide(guide),
        related: related.map((item) => serializeGuide(item)),
        feedback: stats,
      }, { headers: cacheHeaders });
    }

    const search = (url.searchParams.get("q") || "").trim().slice(0, 100);
    const category = (url.searchParams.get("category") || "").trim().slice(0, 90);
    const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
    const limit = Math.max(1, Math.min(30, Number.parseInt(url.searchParams.get("limit") || "12", 10) || 12));
    const filter = publicGuideFilter();
    if (search) {
      const pattern = new RegExp(escapeRegExp(search), "i");
      filter.$and = [
        ...(filter.$and || []),
        { $or: [{ title: pattern }, { summary: pattern }, { tags: pattern }] },
      ];
    }
    if (category) {
      const selectedCategory = await HelpCenterCategory.findOne({ slug: category, active: true }).select("_id").lean();
      if (!selectedCategory) {
        return NextResponse.json({ guides: [], featured: [], recent: [], categories: [], page, pages: 0, total: 0 }, { headers: cacheHeaders });
      }
      filter.categoryId = selectedCategory._id;
    }
    const [guides, total, categories, featuredItems, recentItems] = await Promise.all([
      HelpGuide.find(filter)
        .populate("categoryId", "name slug")
        .sort({ featured: -1, sortOrder: 1, publishedAt: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      HelpGuide.countDocuments(filter),
      HelpCenterCategory.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean(),
      HelpGuide.find({ ...filter, featured: true }).populate("categoryId", "name slug")
        .sort({ sortOrder: 1, publishedAt: -1 }).limit(4).lean(),
      HelpGuide.find(filter).populate("categoryId", "name slug")
        .sort({ updatedAt: -1, publishedAt: -1 }).limit(6).lean(),
    ]);
    const serialized = guides.map((item) => serializeGuide(item));
    return NextResponse.json({
      guides: serialized,
      featured: featuredItems.map((item) => serializeGuide(item)),
      recent: recentItems.map((item) => serializeGuide(item)),
      categories: categories.map((item) => ({ id: item._id.toString(), name: item.name, slug: item.slug })),
      page,
      pages: Math.ceil(total / limit),
      total,
    }, { headers: cacheHeaders });
  } catch (error) {
    console.error("Loading public Help Center failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Help Center is temporarily unavailable." }, { status: 500, headers: cacheHeaders });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { guideId, kind, helpful, message } = parsed.body;
  if (
    !mongoose.isValidObjectId(guideId) ||
    !["helpful", "issue"].includes(kind) ||
    (kind === "helpful" && typeof helpful !== "boolean") ||
    (kind === "issue" && (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 2000 ||
      /<\/?[a-z][^>]*>/i.test(message) ||
      /(?:javascript\s*:|data\s*:\s*text\/html)/i.test(message)
    ))
  ) return NextResponse.json({ error: "Enter valid Help Center feedback." }, { status: 400 });

  try {
    const auth = await getActiveRequestUser(request);
    await connectDB();
    const voterId = auth?.user?.role === "user" ? auth.user._id.toString() : undefined;
    const rate = await consumeRateLimit(request, `help-center-${kind}`, {
      limit: kind === "issue" ? 5 : 30,
      windowMs: kind === "issue" ? 60 * 60 * 1000 : 60 * 60 * 1000,
      identity: voterId,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many Help Center submissions. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
      );
    }
    const guide = await HelpGuide.exists({ _id: guideId, ...publicGuideFilter() });
    if (!guide) return NextResponse.json({ error: "Guide not found." }, { status: 404 });

    if (kind === "helpful") {
      if (voterId) {
        await HelpGuideFeedback.findOneAndUpdate(
          { guideId, userId: voterId, kind: "helpful" },
          { $set: { helpful } },
          { upsert: true, new: true, runValidators: true },
        );
      } else {
        await HelpGuideFeedback.create({ guideId, kind, helpful });
      }
      return NextResponse.json({ message: "Thank you for your feedback." });
    }
    await HelpGuideFeedback.create({
      guideId,
      userId: voterId || null,
      kind: "issue",
      message: message.trim(),
    });
    return NextResponse.json({ message: "Your report was sent to the support team." }, { status: 201 });
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json({ error: "You have already rated this guide." }, { status: 409 });
    }
    console.error("Saving Help Center feedback failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not save your Help Center feedback." }, { status: 500 });
  }
}
