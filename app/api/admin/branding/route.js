import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { deleteCloudinaryAsset, privateImageUrl, uploadPrivateImage } from "@/lib/cloudinary";
import { readPaymentProof } from "@/lib/payment-proof";
import { isSameOriginRequest } from "@/lib/request";
import PortalSettings from "@/models/PortalSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const settings = await PortalSettings.findOne({ key: "global" }).select("branding").lean();
    const expires = Math.floor(Date.now() / 1000) + 3600;
    return NextResponse.json({
      userLogoUrl: settings?.branding?.userLogoPublicId ? privateImageUrl(settings.branding.userLogoPublicId, expires) : "",
      adminLogoUrl: settings?.branding?.adminLogoPublicId ? privateImageUrl(settings.branding.adminLogoPublicId, expires) : "",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Loading administrator branding failed:", error);
    return NextResponse.json({ error: "Could not load branding settings." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  let uploaded;
  let persisted = false;
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const form = await request.formData();
    const type = form.get("type");
    if (!["user", "admin"].includes(type)) {
      return NextResponse.json({ error: "Choose a valid logo destination." }, { status: 400 });
    }
    form.set("proof", form.get("logo"));
    const image = await readPaymentProof(form);
    if (image.error) return NextResponse.json({ error: image.error.replace("Payment proof", "Logo") }, { status: 400 });
    uploaded = await uploadPrivateImage(image.bytes, { folder: "ratewell/branding" });

    const key = type === "user" ? "branding.userLogoPublicId" : "branding.adminLogoPublicId";
    const current = await PortalSettings.findOne({ key: "global" }).select("branding").lean();
    const oldPublicId = type === "user" ? current?.branding?.userLogoPublicId : current?.branding?.adminLogoPublicId;
    const settings = await PortalSettings.findOneAndUpdate(
      { key: "global" },
      { $set: { [key]: uploaded.publicId, updatedBy: auth.user._id } },
      { upsert: true, new: true, runValidators: true },
    );
    persisted = true;
    await writeAdminAudit(request, auth, "branding.logo.updated", {
      type: "PortalSettings",
      id: settings._id.toString(),
      metadata: { logoType: type },
    });
    if (oldPublicId && oldPublicId !== uploaded.publicId) {
      try {
        await deleteCloudinaryAsset(oldPublicId);
      } catch (cleanupError) {
        console.error("Removing previous branding logo failed:", cleanupError);
      }
    }
    return NextResponse.json({
      message: `${type === "user" ? "User" : "Admin"} logo updated.`,
      imageUrl: privateImageUrl(uploaded.publicId, Math.floor(Date.now() / 1000) + 3600),
    });
  } catch (error) {
    if (uploaded?.publicId && !persisted) {
      try {
        await deleteCloudinaryAsset(uploaded.publicId);
      } catch (cleanupError) {
        console.error("Cleaning up failed branding logo upload failed:", cleanupError);
      }
    }
    console.error("Updating administrator branding failed:", error);
    return NextResponse.json({ error: "Could not update branding logo." }, { status: 500 });
  }
}
