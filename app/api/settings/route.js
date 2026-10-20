import { NextResponse } from "next/server";
import { getActiveRequestUser } from "@/lib/request-auth";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import User from "@/models/User";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await getActiveRequestUser(request);
  if (!auth || auth.user.role !== "user") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return NextResponse.json({ preferences: auth.user.preferences });
}

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { notifications, publicProfile, theme } = parsed.body;
  if (
    (notifications !== undefined && typeof notifications !== "boolean") ||
    (publicProfile !== undefined && typeof publicProfile !== "boolean") ||
    (theme !== undefined && !["light", "dark"].includes(theme)) ||
    (notifications === undefined && publicProfile === undefined && theme === undefined)
  ) {
    return NextResponse.json({ error: "Invalid preference settings." }, { status: 400 });
  }
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const updates = {};
    if (notifications !== undefined) updates["preferences.notifications"] = notifications;
    if (publicProfile !== undefined) updates["preferences.publicProfile"] = publicProfile;
    if (theme !== undefined) updates["preferences.theme"] = theme;
    await User.updateOne({ _id: auth.user._id }, { $set: updates });
    return NextResponse.json({ message: "Settings saved." });
  } catch (error) {
    console.error("Saving user settings failed:", error);
    return NextResponse.json({ error: "Could not save settings." }, { status: 500 });
  }
}
