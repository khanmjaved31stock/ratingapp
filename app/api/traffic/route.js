import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import TrafficEvent from "@/models/TrafficEvent";
import connectDB from "@/lib/mongodb";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const path = typeof parsed.body.path === "string" ? parsed.body.path : "";
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.length > 240
  ) {
    return NextResponse.json({ error: "Invalid page path." }, { status: 400 });
  }
  try {
    await connectDB();
    const rate = await consumeRateLimit(request, "traffic", {
      limit: 120,
      windowMs: 60 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many events." }, { status: 429 });
    }
    const address =
      request.headers.get("x-real-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "";
    await TrafficEvent.create({
      type: "pageView",
      path,
      visitorHash: createHash("sha256").update(address).digest("hex"),
    });
    return NextResponse.json({ recorded: true }, { status: 202 });
  } catch (error) {
    console.error("Recording page view failed:", error);
    return NextResponse.json({ error: "Could not record page view." }, { status: 500 });
  }
}
