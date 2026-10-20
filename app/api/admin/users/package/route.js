import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import RegistrationPackage from "@/models/RegistrationPackage";
import User from "@/models/User";
import { consumeRateLimit } from "@/lib/rate-limit";
import { recordPackageHistory } from "@/lib/package-history";
import { getPackageExpiryDate } from "@/lib/package-dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { userId, action, packageId, days } = parsed.body;
  if (
    typeof userId !== "string" ||
    !mongoose.isValidObjectId(userId) ||
    new mongoose.Types.ObjectId(userId).toString() !== userId ||
    !["assign", "extend"].includes(action) ||
    (action === "assign" && (typeof packageId !== "string" || !mongoose.isValidObjectId(packageId))) ||
    (action === "extend" && (!Number.isInteger(days) || days < 1 || days > 365))
  ) {
    return NextResponse.json({ error: "Invalid package change request." }, { status: 400 });
  }
  const auth = await requireAdmin(request, "superAdmin");
  if (auth.response) return auth.response;
  const rate = await consumeRateLimit(request, "admin-user-package-change", { limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many package changes. Try again later." }, { status: 429 });
  const session = await mongoose.startSession();
  try {
    let output;
    await session.withTransaction(async () => {
      const user = await User.findOne({
        _id: userId,
        role: "user",
        paymentStatus: "approved",
        active: true,
        deletedAt: null,
      }).session(session);
      if (!user) {
        const error = new Error("Only active, approved user accounts can receive a package change.");
        error.statusCode = 409;
        throw error;
      }

      const previousPackage = {
        packageId: user.packageId,
        packageName: user.packageName,
        packagePriceMinor: user.packagePriceMinor,
        packageActivatedAt: user.packageActivatedAt,
        packageExpiresAt: user.packageExpiresAt,
      };
      const historySourceId = new mongoose.Types.ObjectId();
      let packageName = "Current package";
      if (action === "assign") {
        const item = await RegistrationPackage.findOne({ _id: packageId, active: true }).session(session);
        if (!item) {
          const error = new Error("Choose an active registration package.");
          error.statusCode = 400;
          throw error;
        }
        const activatedAt = new Date();
        const expiresAt = getPackageExpiryDate(activatedAt, item.validityDays);
        user.packageId = item._id;
        user.packagePriceMinor = item.priceMinor;
        user.packageCurrency = item.currency;
        user.packageName = item.name;
        user.packageValidityDays = item.validityDays;
        user.packageActivatedAt = activatedAt;
        user.packageExpiresAt = expiresAt;
        user.packageDailyEarningLimitMinor = item.dailyEarningLimitMinor || 0;
        user.packageDailyTaskQuota = item.dailyTaskQuota || 0;
        user.packageDailyTaskLimit = item.dailyTaskLimit ?? item.dailyTaskQuota ?? 0;
        user.packagePerTaskEarningsMinor = item.perTaskEarningsMinor || 0;
        user.packageWithdrawalMinimumMinor = item.minimumWithdrawalMinor ?? 100;
        user.packageWithdrawalMaximumMinor = item.maximumWithdrawalMinor ?? null;
        user.packageWithdrawalFeeBrackets = item.withdrawalFeeBrackets || [
          { minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 },
        ];
        user.reviewDailyDate = "";
        user.reviewDailyCount = 0;
        user.reviewTaskStartedAt = null;
        packageName = item.name;
        output = { packageId: item._id.toString(), packageName, packageActivatedAt: activatedAt, packageExpiresAt: expiresAt };
        await user.save({ session });
        await recordPackageHistory({
          user: { ...user.toObject(), ...previousPackage },
          packageSnapshot: item,
          event: "assigned",
          sourceType: "adminAssignment",
          sourceId: historySourceId,
          actorId: auth.user._id,
          amountMinor: item.priceMinor,
          activatedAt,
          expiresAt,
          session,
        });
      } else {
        const now = new Date();
        const base = user.packageExpiresAt && user.packageExpiresAt > now ? user.packageExpiresAt : now;
        user.packageExpiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
        const currentPackage = await RegistrationPackage.findById(user.packageId).session(session).lean();
        packageName = user.packageName || currentPackage?.name || packageName;
        output = { packageId: user.packageId?.toString() || "", packageName, packageActivatedAt: user.packageActivatedAt, packageExpiresAt: user.packageExpiresAt };
        await user.save({ session });
        await recordPackageHistory({
          user: { ...user.toObject(), ...previousPackage },
          packageSnapshot: {
            packageId: user.packageId,
            name: user.packageName || currentPackage?.name,
            description: currentPackage?.description || "",
            benefits: currentPackage?.benefits || [],
            currency: user.packageCurrency,
            validityDays: user.packageValidityDays || 30,
            dailyTaskLimit: user.packageDailyTaskLimit ?? user.packageDailyTaskQuota ?? 0,
            dailyEarningLimitMinor: user.packageDailyEarningLimitMinor || 0,
            perTaskEarningsMinor: user.packagePerTaskEarningsMinor || 0,
            minimumWithdrawalMinor: user.packageWithdrawalMinimumMinor ?? 100,
            maximumWithdrawalMinor: user.packageWithdrawalMaximumMinor ?? null,
            withdrawalFeeBrackets: user.packageWithdrawalFeeBrackets,
          },
          event: "extended",
          sourceType: "adminExtension",
          sourceId: historySourceId,
          actorId: auth.user._id,
          amountMinor: 0,
          activatedAt: user.packageActivatedAt || now,
          expiresAt: user.packageExpiresAt,
          extendedDays: days,
          session,
        });
      }
      await writeAdminAudit(request, auth, action === "assign" ? "user.package-assigned" : "user.package-extended", {
        type: "User",
        id: user._id.toString(),
        metadata: { packageId: output.packageId, packageName, days: action === "extend" ? days : undefined, expiresAt: output.packageExpiresAt.toISOString() },
        session,
      });
      await createNotification(
        {
          userId: user._id,
          type: "package",
          title: action === "assign" ? "Package updated by support" : "Package extended",
          message: `${packageName} is active through ${output.packageExpiresAt.toLocaleDateString()}.`,
        },
        session,
      );
    });
    return NextResponse.json({
      message: action === "assign" ? "Package assigned." : "Package validity extended.",
      user: {
        ...output,
        packageActivatedAt: output.packageActivatedAt?.toISOString() || null,
        packageExpiresAt: output.packageExpiresAt.toISOString(),
      },
    });
  } catch (error) {
    if (error.statusCode) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Changing user package failed:", error);
    return NextResponse.json({ error: "Could not update the user's package." }, { status: 500 });
  } finally {
    await session.endSession();
  }
}
