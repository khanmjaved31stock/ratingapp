import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { deleteCloudinaryAsset, privateImageUrl, uploadPrivateImage } from "@/lib/cloudinary";
import { readPaymentProof } from "@/lib/payment-proof";
import { isSameOriginRequest } from "@/lib/request";
import PortalSettings from "@/models/PortalSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let uploaded;
  let persisted = false;
  let previousPublicId;
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
      return NextResponse.json({ error: "Upload an image using multipart form data." }, { status: 415 });
    }
    const formData = await request.formData();
    const image = await readPaymentProof(formData);
    if (image.error) {
      return NextResponse.json({ error: image.error.replace("Payment proof", "Task image") }, { status: 400 });
    }

    uploaded = await uploadPrivateImage(image.bytes, { folder: "ratewell/review-tasks" });
    const currentSettings = await PortalSettings.findOne({ key: "global" })
      .select("reviewTasks.mediaImagePublicId")
      .lean();
    previousPublicId = currentSettings?.reviewTasks?.mediaImagePublicId || "";
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const settings = await PortalSettings.findOneAndUpdate(
          { key: "global" },
          {
            $set: {
              "reviewTasks.mediaImagePublicId": uploaded.publicId,
              updatedBy: auth.user._id,
            },
            $setOnInsert: { key: "global" },
          },
          { upsert: true, new: true, runValidators: true, session },
        );
        await writeAdminAudit(request, auth, "review-task.image-updated", {
          type: "PortalSettings",
          id: settings._id.toString(),
          session,
        });
      });
      persisted = true;
    } finally {
      await session.endSession();
    }
    if (previousPublicId && previousPublicId !== uploaded.publicId) {
      try {
        await deleteCloudinaryAsset(previousPublicId);
      } catch (cleanupError) {
        console.error("Removing replaced review task image failed:", cleanupError);
      }
    }
    return NextResponse.json({
      message: "Review task image uploaded.",
      imageUrl: privateImageUrl(uploaded.publicId, Math.floor(Date.now() / 1000) + 86400),
    });
  } catch (error) {
    if (uploaded?.publicId && !persisted) {
      try {
        await deleteCloudinaryAsset(uploaded.publicId);
      } catch (cleanupError) {
        console.error("Cleaning up failed review task image failed:", cleanupError);
      }
    }
    console.error("Uploading review task image failed:", error);
    return NextResponse.json({ error: "Could not upload the review task image." }, { status: 500 });
  }
}
