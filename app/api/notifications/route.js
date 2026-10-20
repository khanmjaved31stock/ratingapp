import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getActiveRequestUser } from "@/lib/request-auth";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import { consumeRateLimit } from "@/lib/rate-limit";
import Notification from "@/models/Notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const params = new URL(request.url).searchParams;
    const cursor = params.get("cursor");
    const limitValue = params.get("limit");
    const limit = limitValue ? Number(limitValue) : 20;
    const unreadOnly = params.get("unreadOnly") === "true";
    if (
      (cursor &&
        (!mongoose.isValidObjectId(cursor) ||
          new mongoose.Types.ObjectId(cursor).toString() !== cursor)) ||
      ![10, 20, 50].includes(limit)
    ) {
      return NextResponse.json({ error: "Invalid notification pagination." }, { status: 400 });
    }

    if (auth.user.packageExpiresAt && auth.user.paymentStatus === "approved") {
      const expiresAt = new Date(auth.user.packageExpiresAt);
      const remainingMs = expiresAt.getTime() - Date.now();
      if (remainingMs <= 7 * 24 * 60 * 60 * 1000) {
        const type = remainingMs <= 0 ? "expired" : remainingMs <= 24 * 60 * 60 * 1000 ? "1day" : "7day";
        const message = remainingMs <= 0
          ? "Your earning package has expired. Renew your package to resume task access."
          : `Your package expires ${expiresAt.toLocaleDateString()}. Renew before then to avoid an earning interruption.`;
        await Notification.updateOne(
          { dedupeKey: `package-expiry:${auth.user._id.toString()}:${expiresAt.getTime()}:${type}` },
          {
            $setOnInsert: {
              userId: auth.user._id,
              type: "package",
              title: remainingMs <= 0 ? "Package expired" : "Package expiry reminder",
              message,
            },
          },
          { upsert: true },
        );
      }
    }

    const filter = {
      userId: auth.user._id,
      ...(unreadOnly ? { readAt: null } : {}),
      ...(cursor ? { _id: { $lt: new mongoose.Types.ObjectId(cursor) } } : {}),
    };
    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean(),
      Notification.countDocuments({ userId: auth.user._id, readAt: null }),
    ]);
    const hasMore = notifications.length > limit;
    const page = notifications.slice(0, limit);

    return NextResponse.json(
      {
        unreadCount,
        hasMore,
        nextCursor: hasMore ? page.at(-1)._id.toString() : null,
        notifications: page.map((item) => ({
          id: item._id.toString(),
          type: item.type,
          title: item.title,
          message: item.message,
          read: Boolean(item.readAt),
          createdAt: item.createdAt.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Loading notifications failed:", {
      name: error?.name,
      code: error?.code,
    });
    return NextResponse.json({ error: "Notifications are temporarily unavailable." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { id, all } = parsed.body;
  if (typeof all !== "boolean" && typeof id !== "string") {
    return NextResponse.json({ error: "Choose a notification to mark as read." }, { status: 400 });
  }
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const rate = await consumeRateLimit(request, "notification-update", { limit: 60, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) return NextResponse.json({ error: "Too many notification updates." }, { status: 429 });
    
    const filter = { userId: auth.user._id, readAt: null };
    if (all) {
      await Notification.updateMany(filter, { $set: { readAt: new Date() } });
    } else {
      if (!/^[a-f\d]{24}$/i.test(id)) {
        return NextResponse.json({ error: "Invalid notification identifier." }, { status: 400 });
      }
      await Notification.updateOne(
        { ...filter, _id: id },
        { $set: { readAt: new Date() } },
      );
    }
    return NextResponse.json({ message: "Notification updated." });
  } catch (error) {
    console.error("Updating notifications failed:", error);
    return NextResponse.json({ error: "Could not update notification status." }, { status: 500 });
  }
}