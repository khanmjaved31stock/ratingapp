import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { deleteCloudinaryAsset, privateImageUrl, uploadPrivateImage } from "@/lib/cloudinary";
import { readPaymentProof } from "@/lib/payment-proof";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import AdBanner from "@/models/AdBanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slots = ["header", "sidebar", "footer", "interstitial", "popup"];

function validDestination(value) {
  if (value === "") return true;
  if (typeof value !== "string" || value.length > 2048) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const banners = await AdBanner.find().sort({ createdAt: -1 }).limit(100).lean();
    return NextResponse.json({
      banners: banners.map((item) => ({
        id: item._id.toString(),
        title: item.title,
        imageUrl: privateImageUrl(item.imagePublicId, Math.floor(Date.now() / 1000) + 300),
        href: item.href,
        slot: item.slot,
        active: item.active,
        impressions: item.impressions,
        clicks: item.clicks,
        startsAt: item.startsAt?.toISOString() || "",
        endsAt: item.endsAt?.toISOString() || "",
      })),
    });
  } catch (error) {
    console.error("Loading ad banners failed:", error);
    return NextResponse.json({ error: "Could not load ad banners." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  let uploaded;
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const formData = await request.formData();
    const title = typeof formData.get("title") === "string" ? formData.get("title").trim() : "";
    const slot = formData.get("slot");
    const href = typeof formData.get("href") === "string" ? formData.get("href").trim() : "";
    const startsAtValue = formData.get("startsAt");
    const endsAtValue = formData.get("endsAt");
    const startsAt = typeof startsAtValue === "string" && startsAtValue ? new Date(startsAtValue) : null;
    const endsAt = typeof endsAtValue === "string" && endsAtValue ? new Date(endsAtValue) : null;
    if (
      !title ||
      title.length > 120 ||
      !slots.includes(slot) ||
      !validDestination(href) ||
      (startsAt && Number.isNaN(startsAt.getTime())) ||
      (endsAt && Number.isNaN(endsAt.getTime())) ||
      (startsAt && endsAt && startsAt >= endsAt)
    ) {
      return NextResponse.json({ error: "Enter valid banner title, slot, and link details." }, { status: 400 });
    }
    const image = await readPaymentProof(formData);
    if (image.error) return NextResponse.json({ error: image.error.replace("Payment proof", "Banner") }, { status: 400 });
    uploaded = await uploadPrivateImage(image.bytes, { folder: "ratewell/ad-banners" });
    const banner = await AdBanner.create({
      title,
      imageUrl: uploaded.secureUrl,
      imagePublicId: uploaded.publicId,
      href,
      slot,
      startsAt,
      endsAt,
    });
    await writeAdminAudit(request, auth, "banner.created", {
      type: "AdBanner",
      id: banner._id.toString(),
      metadata: { slot, title },
    });
    return NextResponse.json({ id: banner._id.toString(), message: "Banner created." }, { status: 201 });
  } catch (error) {
    if (uploaded?.publicId) {
      try {
        await deleteCloudinaryAsset(uploaded.publicId);
      } catch (cleanupError) {
        console.error("Cleaning up failed banner upload failed:", cleanupError);
      }
    }
    console.error("Creating ad banner failed:", error);
    return NextResponse.json({ error: "Could not create ad banner." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { id, title, href, slot, active, startsAt: startsAtValue, endsAt: endsAtValue } = parsed.body;
  const startsAt = startsAtValue ? new Date(startsAtValue) : null;
  const endsAt = endsAtValue ? new Date(endsAtValue) : null;
  if (
    typeof id !== "string" ||
    !mongoose.isValidObjectId(id) ||
    new mongoose.Types.ObjectId(id).toString() !== id ||
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 120 ||
    !validDestination(href) ||
    !slots.includes(slot) ||
    typeof active !== "boolean" ||
    (startsAt && Number.isNaN(startsAt.getTime())) ||
    (endsAt && Number.isNaN(endsAt.getTime())) ||
    (startsAt && endsAt && startsAt >= endsAt)
  ) {
    return NextResponse.json({ error: "Invalid banner update." }, { status: 400 });
  }
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const banner = await AdBanner.findByIdAndUpdate(
      id,
      { $set: { title: title.trim(), href, slot, active, startsAt, endsAt } },
      { new: true, runValidators: true },
    );
    if (!banner) return NextResponse.json({ error: "Banner not found." }, { status: 404 });
    await writeAdminAudit(request, auth, "banner.updated", { type: "AdBanner", id });
    return NextResponse.json({ message: "Banner updated." });
  } catch (error) {
    console.error("Updating ad banner failed:", error);
    return NextResponse.json({ error: "Could not update banner." }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const id = parsed.body.id;
  if (typeof id !== "string" || !mongoose.isValidObjectId(id) || new mongoose.Types.ObjectId(id).toString() !== id) {
    return NextResponse.json({ error: "Invalid banner identifier." }, { status: 400 });
  }
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const banner = await AdBanner.findById(id);
    if (!banner) return NextResponse.json({ error: "Banner not found." }, { status: 404 });
    await deleteCloudinaryAsset(banner.imagePublicId);
    await banner.deleteOne();
    await writeAdminAudit(request, auth, "banner.deleted", { type: "AdBanner", id });
    return NextResponse.json({ message: "Banner deleted." });
  } catch (error) {
    console.error("Deleting ad banner failed:", error);
    return NextResponse.json({ error: "Could not delete banner and its image." }, { status: 500 });
  }
}
