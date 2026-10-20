import { NextResponse } from "next/server";
import { getActiveRequestUser } from "@/lib/request-auth";
import {
  deleteCloudinaryAsset,
  privateImageUrl,
  uploadPrivateImage,
} from "@/lib/cloudinary";
import { readPaymentProof } from "@/lib/payment-proof";
import { isSameOriginRequest } from "@/lib/request";
import User from "@/models/User";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const rate = await consumeRateLimit(request, "avatar-upload", {
      limit: 10,
      windowMs: 24 * 60 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many photo uploads. Please try again tomorrow." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
      );
    }
    const formData = await request.formData();
    const avatar = formData.get("avatar");
    const imageForm = new FormData();
    if (avatar instanceof File) imageForm.set("proof", avatar);
    const image = await readPaymentProof(imageForm);
    if (image.error) {
      return NextResponse.json(
        { error: image.error.replace("Payment proof", "Profile photo") },
        { status: 400 },
      );
    }

    const uploaded = await uploadPrivateImage(image.bytes, {
      folder: "ratewell/profile-avatars",
    });
    try {
      const previous = await User.findById(auth.user._id)
        .select("+profileAvatarPublicId")
        .lean();
      const user = await User.findOneAndUpdate(
        { _id: auth.user._id, role: "user", active: true },
        { $set: { profileAvatarPublicId: uploaded.publicId } },
        { new: true },
      ).select("+profileAvatarPublicId");
      if (!user) {
        const error = new Error("Account is no longer available.");
        error.statusCode = 404;
        throw error;
      }
      if (user.profileAvatarPublicId !== uploaded.publicId) {
        await deleteCloudinaryAsset(uploaded.publicId);
        return NextResponse.json({ error: "Could not save the profile photo." }, { status: 500 });
      }
      let message = "Profile photo updated.";
      if (previous?.profileAvatarPublicId) {
        try {
          await deleteCloudinaryAsset(previous.profileAvatarPublicId);
        } catch (cleanupError) {
          console.error("Removing previous profile photo failed:", cleanupError);
          message = "Profile photo updated, but the previous image could not be removed.";
        }
      }
      return NextResponse.json({
        avatar: privateImageUrl(uploaded.publicId, Math.floor(Date.now() / 1000) + 900),
        message,
      });
    } catch (error) {
      await deleteCloudinaryAsset(uploaded.publicId);
      throw error;
    }
  } catch (error) {
    if (error.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Uploading profile photo failed:", error);
    return NextResponse.json({ error: "Could not upload profile photo." }, { status: 500 });
  }
}
