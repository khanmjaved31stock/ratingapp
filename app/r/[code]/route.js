import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import ReferralEvent from "@/models/ReferralEvent";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { code } = await params;
    if (!/^[a-z\d_-]{6,32}$/i.test(code)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    await connectDB();
    const rate = await consumeRateLimit(request, "referral-click", {
      limit: 60,
      windowMs: 60 * 60 * 1000,
    });
    if (rate.allowed) {
      const referrer = await User.findOne({
        referralCode: code.toLowerCase(),
        active: true,
        paymentStatus: "approved",
        deletedAt: null,
      }).select("_id");
      if (referrer) {
        const visitorAddress =
          request.headers.get("x-real-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "";
        await ReferralEvent.create({
          referrerId: referrer._id,
          type: "click",
          visitorHash: createHash("sha256").update(visitorAddress).digest("hex"),
          userAgent: request.headers.get("user-agent") || "",
        });
        const response = NextResponse.redirect(new URL("/", request.url));
        response.cookies.set("referral_code", code.toLowerCase(), {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 30 * 24 * 60 * 60,
        });
        return response;
      }
    }
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("Tracking referral click failed:", error);
    return NextResponse.redirect(new URL("/", request.url));
  }
}
