import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/admin";
import User from "@/models/User";
import { isSameOriginRequest, normalizeEmail, readJsonBody, validPassword } from "@/lib/request";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;

    const admins = await User.find({ role: "helpAdmin" })
      .select("name email active createdAt")
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json({
      admins: admins.map((admin) => ({
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        active: admin.active,
        createdAt: admin.createdAt,
      })),
    });
  } catch (error) {
    console.error("Loading Helpline Admin accounts failed:", error);
    return NextResponse.json({ error: "Could not load administrator accounts." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;

    const parsed = await readJsonBody(request);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const name = typeof parsed.body.name === "string" ? parsed.body.name.trim() : "";
    const email = normalizeEmail(parsed.body.email);
    const password = parsed.body.password;
    if (!name || name.length > 100 || !email || !validPassword(password)) {
      return NextResponse.json(
        { error: "Enter a valid name and email, and a password of at least 12 characters." },
        { status: 400 },
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "helpAdmin",
    });
    return NextResponse.json(
      {
        message: "Helpline Admin account created.",
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
          createdAt: user.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    console.error("Creating Helpline Admin account failed:", error);
    return NextResponse.json({ error: "Could not create the administrator account." }, { status: 500 });
  }
}
