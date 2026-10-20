import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getActiveRequestUser } from "@/lib/request-auth";
import { writeSecurityEvent } from "@/lib/audit";
import { decryptJson, encryptJson } from "@/lib/encryption";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import User from "@/models/User";
import PortalSettings from "@/models/PortalSettings";
import { maskPayoutDetails, normalizePayoutDetails } from "@/lib/payout-details";
import { getConfiguredWithdrawalMethods } from "@/lib/withdrawal-methods";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const [user, settings] = await Promise.all([
      User.findById(auth.user._id)
      .select("+payoutProfile.encryptedDetails payoutProfile.provider payoutProfile.updatedAt")
      .lean(),
      PortalSettings.findOne({ key: "global" }).select("withdrawalMethods").lean(),
    ]);
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    const details = user.payoutProfile?.encryptedDetails
      ? decryptJson(user.payoutProfile.encryptedDetails)
      : null;
    return NextResponse.json({
      payoutProfile: user.payoutProfile?.provider
        ? {
            provider: user.payoutProfile.provider,
            updatedAt: user.payoutProfile.updatedAt?.toISOString?.() || null,
            ...maskPayoutDetails(details || {}),
          }
        : null,
      methods: getConfiguredWithdrawalMethods(settings?.withdrawalMethods)
        .filter((method) => method.enabled)
        .map(({ provider, displayName, instructions }) => ({ provider, displayName, instructions })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Loading payout profile failed:", error);
    return NextResponse.json({ error: "Could not load payout profile." }, { status: 500 });
  }
}

export async function PUT(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.body;
  const details = normalizePayoutDetails(body);
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (!details) {
    return NextResponse.json({ error: "Enter valid payout account details." }, { status: 400 });
  }

  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const settings = await PortalSettings.findOne({ key: "global" })
      .select("withdrawalMethods")
      .lean();
    const method = getConfiguredWithdrawalMethods(settings?.withdrawalMethods)
      .find((item) => item.provider === details.provider && item.enabled);
    if (!method) {
      return NextResponse.json({ error: "That withdrawal method is currently unavailable." }, { status: 400 });
    }
    const user = await User.findOne({ _id: auth.user._id, role: "user", active: true, deletedAt: null })
      .select("+password +payoutProfile.encryptedDetails");
    if (!user) return NextResponse.json({ error: "Your account is no longer active." }, { status: 409 });
    const replacing = Boolean(user.payoutProfile?.encryptedDetails);
    if (replacing && (!currentPassword || !(await bcrypt.compare(currentPassword, user.password)))) {
      return NextResponse.json({ error: "Confirm your current password to change saved payout details." }, { status: 403 });
    }
    const updatedAt = new Date();
    user.payoutProfile.provider = details.provider;
    user.payoutProfile.encryptedDetails = encryptJson(details);
    user.payoutProfile.updatedAt = updatedAt;
    await user.save();
    await writeSecurityEvent(request, {
      type: replacing ? "payoutProfileChanged" : "payoutProfileCreated",
      userId: user._id,
      email: user.email,
      details: `User updated encrypted ${details.provider} payout profile.`,
    });
    return NextResponse.json({
      message: replacing ? "Payout details updated securely." : "Payout details saved securely.",
      payoutProfile: {
        provider: details.provider,
        ...maskPayoutDetails(details),
        updatedAt: updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Saving payout profile failed:", {
      name: error?.name,
      code: error?.code,
    });
    if (error?.code === "ENCRYPTION_KEY_MISSING" || error?.code === "ENCRYPTION_KEY_INVALID") {
      return NextResponse.json({
        error: "Secure payout saving is not configured correctly. Please contact the administrator.",
      }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not save payout profile." }, { status: 500 });
  }
}
