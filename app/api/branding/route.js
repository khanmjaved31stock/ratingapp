import { NextResponse } from "next/server";
import { privateImageUrl } from "@/lib/cloudinary";
import connectDB from "@/lib/mongodb";
import PortalSettings from "@/models/PortalSettings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const settings = await PortalSettings.findOne({ key: "global" })
      .select("branding.userLogoPublicId")
      .lean();
    const publicId = settings?.branding?.userLogoPublicId;
    return NextResponse.json({
      userLogoUrl: publicId ? privateImageUrl(publicId, Math.floor(Date.now() / 1000) + 3600) : "",
    }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    console.error("Loading public branding failed:", error);
    return NextResponse.json({ error: "Branding is temporarily unavailable." }, { status: 500 });
  }
}
