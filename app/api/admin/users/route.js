import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getAdminUsersPage, isValidUserCursor } from "@/lib/admin-data";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import { validPassword } from "@/lib/request";
import Rating from "@/models/Rating";
import User from "@/models/User";
import ActiveSession from "@/models/ActiveSession";
import { writeAdminAudit, writeSecurityEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;

    const params = new URL(request.url).searchParams;
    const cursor = params.get("cursor");
    if (!isValidUserCursor(cursor)) {
      return NextResponse.json({ error: "Invalid pagination cursor." }, { status: 400 });
    }

    const role = params.get("role") || "";
    const status = params.get("status") || "";
    const sort = params.get("sort") || "newest";
    const search = params.get("search") || "";
    if (
      (role && !["user", "helpAdmin", "moderator"].includes(role)) ||
      (status && !["active", "disabled"].includes(status)) ||
      !["newest", "oldest"].includes(sort) ||
      search.length > 100 ||
      search.split("").some((character) => character.charCodeAt(0) < 32)
    ) {
      return NextResponse.json({ error: "Invalid account filters." }, { status: 400 });
    }
    return NextResponse.json(await getAdminUsersPage({ cursor, role, status, sort, search }), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Loading user accounts failed:", error);
    return NextResponse.json({ error: "Could not load user accounts." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const parsed = await readJsonBody(request);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { userId, active, role } = parsed.body;
  if (
    typeof userId !== "string" ||
    !mongoose.isValidObjectId(userId) ||
    new mongoose.Types.ObjectId(userId).toString() !== userId ||
    (typeof active !== "boolean" &&
      role === undefined) ||
    (role !== undefined &&
      !["user", "helpAdmin", "moderator"].includes(role))
  ) {
    return NextResponse.json({ error: "Invalid account update." }, { status: 400 });
  }

  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;

    const update = {};
    if (typeof active === "boolean") {
      update.active = active;
      update.suspended = !active;
    }
    if (role) update.role = role;
    const roleChanged = Boolean(role);
    const updated = await User.findOneAndUpdate(
      {
        _id: userId,
        role: { $in: ["user", "helpAdmin", "moderator"] },
        deletedAt: null,
      },
      {
        $set: update,
        ...(roleChanged || typeof active === "boolean" ? { $inc: { sessionVersion: 1 } } : {}),
      },
      { new: true, runValidators: true },
    ).select("name email role active suspended emailVerified createdAt paymentStatus packageActivatedAt packageExpiresAt");

    if (!updated) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    if (roleChanged || typeof active === "boolean") {
      await ActiveSession.updateMany(
        { userId: updated._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    }
    await writeAdminAudit(request, auth, roleChanged ? "user.role-changed" : "user.status-changed", {
      type: "User",
      id: updated._id.toString(),
      metadata: { role: updated.role, active: updated.active },
    });
    if (roleChanged) {
      await writeSecurityEvent(request, {
        type: "privilegeChanged",
        userId: updated._id,
        email: updated.email,
        details: `Role changed to ${updated.role}.`,
      });
    }

    return NextResponse.json({
      user: {
        id: updated._id.toString(),
        name: updated.name,
        email: updated.email,
        role: updated.role,
        active: updated.active,
        suspended: updated.suspended,
        emailVerified: updated.emailVerified,
        createdAt: updated.createdAt.toISOString(),
        paymentStatus: updated.paymentStatus,
        packageActivatedAt: updated.packageActivatedAt?.toISOString() || null,
        packageExpiresAt: updated.packageExpiresAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error("Updating user account failed:", error);
    return NextResponse.json({ error: "Could not update this account." }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const parsed = await readJsonBody(request);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const userId = parsed.body.userId;
  if (
    typeof userId !== "string" ||
    !mongoose.isValidObjectId(userId) ||
    new mongoose.Types.ObjectId(userId).toString() !== userId
  ) {
    return NextResponse.json({ error: "Invalid account identifier." }, { status: 400 });
  }

  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const dbSession = await mongoose.startSession();
    const deletedAt = new Date();
    const password = await bcrypt.hash(randomBytes(48).toString("base64url"), 12);
    try {
      await dbSession.withTransaction(async () => {
        const user = await User.findOneAndUpdate(
          {
            _id: userId,
            role: { $in: ["user", "helpAdmin", "moderator"] },
            deletedAt: null,
          },
          {
            $set: {
              name: "Deleted account",
              email: `deleted-${userId}@redacted.invalid`,
              password,
              role: "user",
              active: false,
              deletedAt,
              paymentStatus: "rejected",
              referralCode: `deleted-${userId}`,
              referredBy: null,
              "payoutProfile.provider": "",
              "payoutProfile.encryptedDetails": "",
              profileAvatar: "",
              profileAvatarPublicId: "",
            },
            $inc: { sessionVersion: 1 },
          },
          { new: true, session: dbSession },
        ).select("_id");
        if (!user) {
          const error = new Error("Account not found or already deleted.");
          error.statusCode = 404;
          throw error;
        }

        await Rating.updateMany(
          { userId: user._id },
          { $set: { userId: null } },
          { session: dbSession },
        );
        await ActiveSession.updateMany(
          { userId: user._id, revokedAt: null },
          { $set: { revokedAt: new Date() } },
          { session: dbSession },
        );
        await User.updateMany(
          { referredBy: user._id },
          { $set: { referredBy: null } },
          { session: dbSession },
        );
        await writeAdminAudit(request, auth, "user.deleted", {
          type: "User",
          id: user._id.toString(),
          metadata: { ratingsAnonymized: true },
          session: dbSession,
        });
      });
      return NextResponse.json({ message: "Account deleted and ratings anonymized." });
    } catch (error) {
      if (error.statusCode) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }
      throw error;
    } finally {
      await dbSession.endSession();
    }
  } catch (error) {
    console.error("Deleting user account failed:", error);
    return NextResponse.json(
      { error: "Could not complete account deletion and rating anonymization." },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { userId, newPassword } = parsed.body;
  if (
    typeof userId !== "string" ||
    !mongoose.isValidObjectId(userId) ||
    new mongoose.Types.ObjectId(userId).toString() !== userId ||
    !validPassword(newPassword)
  ) {
    return NextResponse.json(
      { error: "Enter a valid account and password (12–72 UTF-8 bytes)." },
      { status: 400 },
    );
  }
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const password = await bcrypt.hash(newPassword, 12);
    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        role: { $in: ["user", "helpAdmin", "moderator"] },
        deletedAt: null,
      },
      { $set: { password }, $inc: { sessionVersion: 1 } },
      { new: true },
    ).select("_id email");
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    await ActiveSession.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    await writeAdminAudit(request, auth, "user.password-reset", {
      type: "User",
      id: userId,
    });
    await writeSecurityEvent(request, {
      type: "privilegeChanged",
      userId: user._id,
      email: user.email,
      details: "Password reset by Super Admin; all sessions revoked.",
    });
    return NextResponse.json({ message: "Password reset and sessions terminated." });
  } catch (error) {
    console.error("Resetting account password failed:", error);
    return NextResponse.json({ error: "Could not reset account password." }, { status: 500 });
  }
}
