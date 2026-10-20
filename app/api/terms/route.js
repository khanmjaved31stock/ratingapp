import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { getActiveRequestUser } from "@/lib/request-auth";
import { writeSecurityEvent } from "@/lib/audit";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import {
  requiresTermsAcceptance,
  DEFAULT_PRIVACY,
  DEFAULT_TERMS,
  DEFAULT_TERMS_VERSION,
} from "@/lib/legal-terms";
import PortalSettings from "@/models/PortalSettings";
import User from "@/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await connectDB();
    const settings = await PortalSettings.findOne({ key: "global" }).select("legalContent").lean();
    const legalContent = settings?.legalContent || {};
    const auth = await getActiveRequestUser(request, { allowPendingPayment: true });
    return NextResponse.json(
      {
        termsVersion: legalContent.termsVersion || DEFAULT_TERMS_VERSION,
        terms: legalContent.terms || DEFAULT_TERMS,
        privacy: legalContent.privacy || DEFAULT_PRIVACY,
        requireReacceptance: Boolean(legalContent.requireReacceptance),
        needsAcceptance: requiresTermsAcceptance(auth?.user, legalContent),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Loading legal policies failed:", error);
    return NextResponse.json({ error: "Legal policies are temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.body.accepted !== true) {
    return NextResponse.json({ error: "Accept the current Terms & Conditions to continue." }, { status: 400 });
  }

  try {
    const auth = await getActiveRequestUser(request, { allowPendingPayment: true });
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Sign in with an active user account to accept updated terms." }, { status: 401 });
    }
    const settings = await PortalSettings.findOne({ key: "global" }).select("legalContent").lean();
    const termsVersion = settings?.legalContent?.termsVersion || DEFAULT_TERMS_VERSION;
    if (parsed.body.termsVersion !== termsVersion) {
      return NextResponse.json({ error: "The Terms & Conditions changed. Reload and review the current version." }, { status: 409 });
    }
    const acceptedAt = new Date();
    const result = await User.updateOne(
      { _id: auth.user._id, termsVersion: { $ne: termsVersion } },
      { $set: { termsVersion, termsAcceptedAt: acceptedAt } },
    );
    if (result.modifiedCount) {
      await writeSecurityEvent(request, {
        type: "termsAccepted",
        userId: auth.user._id,
        email: auth.user.email,
        details: `Accepted terms version ${termsVersion}.`,
      });
    }
    return NextResponse.json({ message: "Current Terms & Conditions accepted." });
  } catch (error) {
    console.error("Recording terms acceptance failed:", error);
    return NextResponse.json({ error: "Could not record your terms acceptance." }, { status: 500 });
  }
}
