import { NextResponse } from "next/server";
import { getActiveRequestUser } from "@/lib/request-auth";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import User from "@/models/User";
import { privateImageUrl } from "@/lib/cloudinary";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp-phone";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const user = await User.findById(auth.user._id)
      .select("name email whatsappPhone preferences profileAvatar +profileAvatarPublicId")
      .lean();
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    return NextResponse.json({
      profile: {
        name: user.name,
        email: user.email,
        whatsappPhone: user.whatsappPhone || "",
        avatar: user.profileAvatarPublicId
          ? privateImageUrl(user.profileAvatarPublicId, Math.floor(Date.now() / 1000) + 900)
          : "",
        preferences: user.preferences,
      },
    });
  } catch (error) {
    console.error("Loading profile failed:", error);
    return NextResponse.json({ error: "Could not load profile." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const name = typeof parsed.body.name === "string" ? parsed.body.name.trim() : "";
  if (!name || name.length > 100) {
    return NextResponse.json({ error: "Enter a name under 100 characters." }, { status: 400 });
  }
  const hasWhatsAppUpdate = Object.hasOwn(parsed.body, "whatsappPhone");
  const whatsappPhone = hasWhatsAppUpdate
    ? normalizeWhatsAppPhone(parsed.body.whatsappPhone)
    : undefined;
  if (hasWhatsAppUpdate && !whatsappPhone) {
    return NextResponse.json({ error: "Enter a valid WhatsApp number with its country code." }, { status: 400 });
  }
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const user = await User.findOneAndUpdate(
      { _id: auth.user._id, role: "user", active: true },
      { $set: { name, ...(hasWhatsAppUpdate ? { whatsappPhone } : {}) } },
      { new: true },
    ).select("name email whatsappPhone profileAvatar preferences +profileAvatarPublicId");
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    return NextResponse.json({
      profile: {
        name: user.name,
        email: user.email,
        whatsappPhone: user.whatsappPhone || "",
        avatar: user.profileAvatarPublicId
          ? privateImageUrl(user.profileAvatarPublicId, Math.floor(Date.now() / 1000) + 900)
          : "",
        preferences: user.preferences,
      },
    });
  } catch (error) {
    console.error("Updating profile failed:", error);
    return NextResponse.json({ error: "Could not update profile." }, { status: 500 });
  }
}
