import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import RegistrationPackage from "@/models/RegistrationPackage";
import { isValidWithdrawalPolicy } from "@/lib/withdrawal-fee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getWithdrawalPolicy(body) {
  const minimumWithdrawalMinor = body.minimumWithdrawalMinor ?? 100;
  const maximumWithdrawalMinor = body.maximumWithdrawalMinor ?? null;
  const withdrawalFeeBrackets = Array.isArray(body.withdrawalFeeBrackets)
    ? body.withdrawalFeeBrackets.map((bracket) =>
        bracket && typeof bracket === "object"
          ? {
              minimumAmountMinor: bracket.minimumAmountMinor,
              maximumAmountMinor: bracket.maximumAmountMinor ?? null,
              basisPoints: bracket.basisPoints,
            }
          : bracket,
      )
    : body.withdrawalFeeBrackets === undefined
      ? [{ minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 }]
      : null;
  return { minimumWithdrawalMinor, maximumWithdrawalMinor, withdrawalFeeBrackets };
}

function validatePackage(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const benefits = Array.isArray(body.benefits)
    ? body.benefits
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const priceMinor = body.priceMinor;
  const validityDays = body.validityDays ?? 30;
  const dailyEarningLimitMinor = body.dailyEarningLimitMinor ?? 0;
  const dailyTaskQuota = body.dailyTaskQuota ?? 0;
  const dailyTaskLimit = body.dailyTaskLimit ?? dailyTaskQuota;
  const perTaskEarningsMinor = body.perTaskEarningsMinor ?? 0;
  const withdrawalPolicy = getWithdrawalPolicy(body);
  const recommendedPackageId = body.recommendedPackageId || "";
  const eligibleReferralTiers = Array.isArray(body.eligibleReferralTiers)
    ? body.eligibleReferralTiers.filter((item) => typeof item === "string").map((item) => item.trim().toLowerCase()).filter(Boolean)
    : [];
  if (
    !name ||
    name.length > 100 ||
    description.length > 500 ||
    !Number.isInteger(priceMinor) ||
    priceMinor < 1 ||
    priceMinor > 100000000 ||
    !Number.isInteger(validityDays) ||
    validityDays < 1 ||
    validityDays > 365 ||
    !Number.isSafeInteger(dailyEarningLimitMinor) ||
    dailyEarningLimitMinor < 0 ||
    dailyEarningLimitMinor > 100000000 ||
    !Number.isInteger(dailyTaskQuota) ||
    dailyTaskQuota < 0 ||
    dailyTaskQuota > 1000 ||
    !Number.isInteger(dailyTaskLimit) ||
    dailyTaskLimit < 0 ||
    dailyTaskLimit > 1000 ||
    !Number.isSafeInteger(perTaskEarningsMinor) ||
    perTaskEarningsMinor < 0 ||
    perTaskEarningsMinor > 1000000 ||
    !isValidWithdrawalPolicy(
      withdrawalPolicy.minimumWithdrawalMinor,
      withdrawalPolicy.maximumWithdrawalMinor,
      withdrawalPolicy.withdrawalFeeBrackets,
    ) ||
    benefits.length > 20 ||
    benefits.some((item) => item.length > 200) ||
    eligibleReferralTiers.length > 20 ||
    eligibleReferralTiers.some((item) => item.length > 40 || !/^[a-z0-9][a-z0-9_-]*$/.test(item)) ||
    new Set(eligibleReferralTiers).size !== eligibleReferralTiers.length ||
    (recommendedPackageId &&
      (typeof recommendedPackageId !== "string" ||
        !mongoose.isValidObjectId(recommendedPackageId) ||
        new mongoose.Types.ObjectId(recommendedPackageId).toString() !== recommendedPackageId))
  ) {
    return null;
  }
  return {
    name,
    description,
    benefits,
    priceMinor,
    validityDays,
    dailyEarningLimitMinor,
    dailyTaskQuota: dailyTaskLimit,
    dailyTaskLimit,
    perTaskEarningsMinor,
    ...withdrawalPolicy,
    withdrawalFeeBrackets: [...withdrawalPolicy.withdrawalFeeBrackets].sort(
      (left, right) => left.minimumAmountMinor - right.minimumAmountMinor,
    ),
    currency: "PKR",
    active: typeof body.active === "boolean" ? body.active : true,
    sortOrder: Number.isInteger(body.sortOrder) ? body.sortOrder : 0,
    recommendedPackageId: recommendedPackageId
      ? new mongoose.Types.ObjectId(recommendedPackageId)
      : null,
    eligibleReferralTiers,
  };
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const packages = await RegistrationPackage.find()
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    return NextResponse.json({
      packages: packages.map((item) => ({
        id: item._id.toString(),
        name: item.name,
        description: item.description,
        benefits: item.benefits,
        priceMinor: item.priceMinor,
        validityDays: item.validityDays ?? 30,
        dailyEarningLimitMinor: item.dailyEarningLimitMinor ?? 0,
        dailyTaskQuota: item.dailyTaskLimit ?? item.dailyTaskQuota ?? 0,
        dailyTaskLimit: item.dailyTaskLimit ?? item.dailyTaskQuota ?? 0,
        perTaskEarningsMinor: item.perTaskEarningsMinor ?? 0,
        minimumWithdrawalMinor: item.minimumWithdrawalMinor ?? 100,
        maximumWithdrawalMinor: item.maximumWithdrawalMinor ?? null,
        withdrawalFeeBrackets: item.withdrawalFeeBrackets || [
          { minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 },
        ],
        currency: item.currency,
        active: item.active,
        archivedAt: item.archivedAt?.toISOString() || null,
        sortOrder: item.sortOrder,
        recommendedPackageId: item.recommendedPackageId?.toString() || "",
        eligibleReferralTiers: item.eligibleReferralTiers || [],
      })),
    });
  } catch (error) {
    console.error("Loading packages failed:", error);
    return NextResponse.json({ error: "Could not load packages." }, { status: 500 });
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
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const withdrawalPolicy = getWithdrawalPolicy(parsed.body);
    if (!isValidWithdrawalPolicy(
      withdrawalPolicy.minimumWithdrawalMinor,
      withdrawalPolicy.maximumWithdrawalMinor,
      withdrawalPolicy.withdrawalFeeBrackets,
    )) {
      return NextResponse.json(
        { error: "Withdrawal brackets must cover the full permitted amount range without gaps or overlaps and use a percentage below 100%." },
        { status: 400 },
      );
    }
    const packageData = validatePackage(parsed.body);
    if (!packageData) return NextResponse.json({ error: "Invalid package details." }, { status: 400 });
    if (packageData.perTaskEarningsMinor < 1) {
      return NextResponse.json({ error: "Per-task earnings must be at least 1 paisa." }, { status: 400 });
    }
    if (packageData.recommendedPackageId) {
      const recommended = await RegistrationPackage.exists({
        _id: packageData.recommendedPackageId,
        active: true,
      });
      if (!recommended) return NextResponse.json({ error: "Choose an existing active recommended package." }, { status: 400 });
    }

    const item = await RegistrationPackage.create(packageData);
    await writeAdminAudit(request, auth, "package.created", {
      type: "RegistrationPackage",
      id: item._id.toString(),
      metadata: {
        name: item.name,
        priceMinor: item.priceMinor,
        minimumWithdrawalMinor: item.minimumWithdrawalMinor,
        maximumWithdrawalMinor: item.maximumWithdrawalMinor,
        withdrawalFeeBrackets: item.withdrawalFeeBrackets,
      },
    });
    return NextResponse.json({ id: item._id.toString() }, { status: 201 });
  } catch (error) {
    console.error("Creating package failed:", error);
    return NextResponse.json({ error: "Could not create package." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const parsed = await readJsonBody(request);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const withdrawalPolicy = getWithdrawalPolicy(parsed.body);
    if (!isValidWithdrawalPolicy(
      withdrawalPolicy.minimumWithdrawalMinor,
      withdrawalPolicy.maximumWithdrawalMinor,
      withdrawalPolicy.withdrawalFeeBrackets,
    )) {
      return NextResponse.json(
        { error: "Withdrawal brackets must cover the full permitted amount range without gaps or overlaps and use a percentage below 100%." },
        { status: 400 },
      );
    }
    const { id } = parsed.body;
    const packageData = validatePackage(parsed.body);
    if (
      typeof id !== "string" ||
      !mongoose.isValidObjectId(id) ||
      new mongoose.Types.ObjectId(id).toString() !== id ||
      !packageData
    ) {
      return NextResponse.json({ error: "Invalid package update." }, { status: 400 });
    }
    if (packageData.recommendedPackageId) {
      if (packageData.recommendedPackageId.toString() === id) {
        return NextResponse.json({ error: "A package cannot recommend itself." }, { status: 400 });
      }
      const recommended = await RegistrationPackage.exists({
        _id: packageData.recommendedPackageId,
        active: true,
      });
      if (!recommended) return NextResponse.json({ error: "Choose an existing active recommended package." }, { status: 400 });
    }

    const existing = await RegistrationPackage.findById(id).select("archivedAt");
    if (!existing) return NextResponse.json({ error: "Package not found." }, { status: 404 });
    if (existing.archivedAt) {
      return NextResponse.json({ error: "Archived packages cannot be reactivated. Create a new package instead." }, { status: 409 });
    }
    const item = await RegistrationPackage.findByIdAndUpdate(
      { _id: id, archivedAt: null },
      { $set: packageData },
      { new: true, runValidators: true },
    );
    if (!item) return NextResponse.json({ error: "Package not found." }, { status: 404 });
    await writeAdminAudit(request, auth, "package.updated", {
      type: "RegistrationPackage",
      id,
      metadata: {
        minimumWithdrawalMinor: item.minimumWithdrawalMinor,
        maximumWithdrawalMinor: item.maximumWithdrawalMinor,
        withdrawalFeeBrackets: item.withdrawalFeeBrackets,
      },
    });
    return NextResponse.json({ id: item._id.toString() });
  } catch (error) {
    console.error("Updating package failed:", error);
    return NextResponse.json({ error: "Could not update package." }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const parsed = await readJsonBody(request);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { id } = parsed.body;
    if (
      typeof id !== "string" ||
      !mongoose.isValidObjectId(id) ||
      new mongoose.Types.ObjectId(id).toString() !== id
    ) {
      return NextResponse.json({ error: "Invalid package identifier." }, { status: 400 });
    }
    const item = await RegistrationPackage.findOneAndUpdate(
      { _id: id, archivedAt: null },
      { $set: { active: false, archivedAt: new Date() } },
      { new: true },
    );
    if (!item) return NextResponse.json({ error: "Package not found or already archived." }, { status: 404 });
    await writeAdminAudit(request, auth, "package.archived", {
      type: "RegistrationPackage",
      id,
      metadata: { name: item.name, archivedAt: item.archivedAt.toISOString() },
    });
    return NextResponse.json({ message: "Package archived. Existing user and transaction history was preserved." });
  } catch (error) {
    console.error("Deleting package failed:", error);
    return NextResponse.json({ error: "Could not archive package." }, { status: 500 });
  }
}
