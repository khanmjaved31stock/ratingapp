import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import PortalSettings from "@/models/PortalSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const now = new Date();
    const settings = await PortalSettings.findOne({ key: "global" })
      .select("marqueeNews")
      .lean();
    const news = settings?.marqueeNews;
    const active = Boolean(
      news?.active &&
      news.message &&
      (!news.startsAt || news.startsAt <= now) &&
      (!news.endsAt || news.endsAt > now),
    );
    return NextResponse.json(
      { message: active ? news.message : "" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Loading portal announcement failed:", error);
    return NextResponse.json({ error: "Announcements are temporarily unavailable." }, { status: 500 });
  }
}
