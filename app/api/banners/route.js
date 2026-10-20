import { NextResponse } from "next/server";
import { privateImageUrl } from "@/lib/cloudinary";
import connectDB from "@/lib/mongodb";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import AdBanner from "@/models/AdBanner";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const slot = new URL(request.url).searchParams.get("slot");
  if (!["header", "sidebar", "footer", "interstitial", "popup"].includes(slot)) {
    return NextResponse.json({ error: "Choose a valid banner slot." }, { status: 400 });
  }
  try {
    await connectDB();
    const now = new Date();
    const banners = await AdBanner.find({
      slot,
      active: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(slot === "popup" ? 1 : 4)
      .lean();
    if (banners.length) {
      await AdBanner.updateMany(
        { _id: { $in: banners.map((item) => item._id) } },
        { $inc: { impressions: 1 } },
      );
    }
    return NextResponse.json(
      {
        banners: banners.map((item) => ({
          id: item._id.toString(),
          title: item.title,
          imageUrl: privateImageUrl(item.imagePublicId, Math.floor(Date.now() / 1000) + 300),
          href: item.href,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Loading public ad banners failed:", error);
    return NextResponse.json({ error: "Ad banners are temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    await connectDB();
    const rate = await consumeRateLimit(request, "banner-click", {
      limit: 60,
      windowMs: 60 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many banner events." }, { status: 429 });
    }
    const { id } = parsed.body;
    if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid banner identifier." }, { status: 400 });
    }
    const result = await AdBanner.updateOne(
      {
        _id: id,
        active: true,
        $or: [{ endsAt: null }, { endsAt: { $gt: new Date() } }],
      },
      { $inc: { clicks: 1 } },
    );
    if (!result.matchedCount) return NextResponse.json({ error: "Banner unavailable." }, { status: 404 });
    return NextResponse.json({ message: "Click recorded." });
  } catch (error) {
    console.error("Recording banner click failed:", error);
    return NextResponse.json({ error: "Could not record banner click." }, { status: 500 });
  }
}
