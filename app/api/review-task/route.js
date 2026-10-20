import { NextResponse } from "next/server";
import { getActiveRequestUser } from "@/lib/request-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request";
import PortalSettings from "@/models/PortalSettings";
import Rating from "@/models/Rating";
import User from "@/models/User";
import { ensurePackageTerm } from "@/lib/package-term";
import { privateImageUrl } from "@/lib/cloudinary";
import WalletTransaction from "@/models/WalletTransaction";
import { getBusinessDayRange } from "@/lib/business-time";
import ReviewTaskAssignment from "@/models/ReviewTaskAssignment";
import { currentTermsRequiredMessage, requiresCurrentTermsAcceptance } from "@/lib/legal-terms";
import { getPreviousActiveAssignmentFilter } from "@/lib/review-task-assignments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user" || auth.user.paymentStatus !== "approved") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (await requiresCurrentTermsAcceptance(auth.user)) {
      return NextResponse.json(
        { error: currentTermsRequiredMessage(), termsRequired: true },
        { status: 428 },
      );
    }
    const rate = await consumeRateLimit(request, "review-task-start", { limit: 30, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many review task starts. Please try again later." }, { status: 429 });
    }

    let settings = await PortalSettings.findOne({ key: "global" })
      .select("reviewTasks reviewTaskCompletedCount ratingRewardMinor businessTimeZone");
    if (!settings) settings = await PortalSettings.create({ key: "global" });
    const now = new Date();
    const businessDay = getBusinessDayRange(now, settings.businessTimeZone || "UTC");
    await ReviewTaskAssignment.updateMany(
      getPreviousActiveAssignmentFilter(auth.user._id, businessDay.date),
      { $set: { status: "expired", expiredAt: now } },
    );
    const account = await User.findById(auth.user._id)
      .select("paymentStatus packageActivatedAt packageExpiresAt packageId packageDailyEarningLimitMinor packageDailyTaskQuota packageDailyTaskLimit packagePerTaskEarningsMinor lastReviewAt ratingCount reviewTaskTotalCount +reviewTaskStartedAt");
    const packageTerm = await ensurePackageTerm(account);
    if (!packageTerm.active) {
      return NextResponse.json({
        error: "Your registration package has expired. Renew your package to submit review tasks or earn rewards.",
        packageExpired: true,
        packageExpiresAt: packageTerm.expiresAt?.toISOString() || null,
      }, { status: 403 });
    }
    const task = settings?.reviewTasks || {};
    if (task.packageIds?.length && !task.packageIds.some((id) => id.toString() === auth.user.packageId?.toString())) {
      return NextResponse.json({ error: "Review tasks are not available for your registration package." }, { status: 403 });
    }
    if (task.totalLimit > 0 && (settings.reviewTaskCompletedCount === null || settings.reviewTaskCompletedCount === undefined)) {
      const existingCount = await Rating.countDocuments({});
      settings.reviewTaskCompletedCount = existingCount;
      await settings.save();
    }
    const lastReviewAt = auth.user.lastReviewAt ? new Date(auth.user.lastReviewAt) : null;
    const cooldownMs = Math.max(0, (task.cooldownSeconds || 0) * 1000 - (lastReviewAt ? now.getTime() - lastReviewAt.getTime() : Infinity));
    if (cooldownMs > 0) {
      return NextResponse.json(
        { error: "Your review cooldown is still active.", cooldownMs },
        { status: 429, headers: { "Retry-After": String(Math.ceil(cooldownMs / 1000)) } },
      );
    }
    const userTotalCount = account.reviewTaskTotalCount || await Rating.countDocuments({ userId: account._id });
    const dailyCount = await Rating.countDocuments({
      userId: auth.user._id,
      createdAt: { $gte: businessDay.start, $lt: businessDay.end },
    });
    const configuredTaskCaps = [task.dailyLimit, account.packageDailyTaskLimit ?? account.packageDailyTaskQuota].filter((value) => value > 0);
    const dailyTaskLimit = configuredTaskCaps.length ? Math.min(...configuredTaskCaps) : 0;
    if (dailyTaskLimit > 0 && dailyCount >= dailyTaskLimit) {
      return NextResponse.json({ error: "You have reached today's review task limit." }, { status: 409 });
    }
    const slot = dailyCount;
    const existingAssignment = await ReviewTaskAssignment.findOne({
      userId: auth.user._id,
      businessDate: businessDay.date,
      slot,
      status: "active",
    }).select("rewardMinor");
    const configuredRewardMinor =
      account.packagePerTaskEarningsMinor || task.rewardMinor || settings?.ratingRewardMinor || 0;
    const rewardMinor = Number.isSafeInteger(existingAssignment?.rewardMinor) &&
      existingAssignment.rewardMinor >= 0
      ? existingAssignment.rewardMinor
      : configuredRewardMinor;
    const dailyEarningLimitMinor = account.packageDailyEarningLimitMinor || 0;
    if (dailyEarningLimitMinor > 0) {
      const [usage, pendingUsage] = await Promise.all([
        WalletTransaction.aggregate([
          {
            $match: {
              userId: account._id,
              type: "ratingReward",
              status: "completed",
              $or: [
                { businessDate: businessDay.date },
                {
                  businessDate: { $in: ["", null] },
                  createdAt: { $gte: businessDay.start, $lt: businessDay.end },
                },
              ],
            },
          },
          { $group: { _id: null, totalMinor: { $sum: "$amountMinor" } } },
        ]),
        ReviewTaskAssignment.aggregate([
          {
            $match: {
              userId: account._id,
              businessDate: businessDay.date,
              status: "submitted",
            },
          },
          { $group: { _id: null, totalMinor: { $sum: { $ifNull: ["$rewardMinor", 0] } } } },
        ]),
      ]);
      const earnedMinor = usage[0]?.totalMinor || 0;
      const pendingMinor = pendingUsage[0]?.totalMinor || 0;
      if (earnedMinor + pendingMinor + rewardMinor > dailyEarningLimitMinor) {
        return NextResponse.json({ error: "You have reached your package's daily earning limit." }, { status: 409 });
      }
    }
    if (task.userTotalLimit > 0 && userTotalCount >= task.userTotalLimit) {
      return NextResponse.json({ error: "You have reached your total review task limit." }, { status: 409 });
    }
    if (task.totalLimit > 0 && (settings?.reviewTaskCompletedCount || 0) >= task.totalLimit) {
      return NextResponse.json({ error: "The review task quota has been reached." }, { status: 409 });
    }

    let assignment;
    try {
      assignment = await ReviewTaskAssignment.findOneAndUpdate(
        {
          userId: auth.user._id,
          businessDate: businessDay.date,
          slot,
        },
        {
          $setOnInsert: {
            status: "active",
            startedAt: now,
            expiresAt: businessDay.end,
            rewardMinor,
          },
        },
        { upsert: true, new: true, runValidators: true },
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
      assignment = await ReviewTaskAssignment.findOne({
        userId: auth.user._id,
        businessDate: businessDay.date,
        slot,
      });
    }
    if (!assignment || assignment.status !== "active") {
      return NextResponse.json({ error: "A review task session could not be started. Please retry." }, { status: 409 });
    }
    const startedAt = assignment.startedAt;
    const userUpdated = await User.updateOne(
      {
        _id: auth.user._id,
        role: "user",
        sessionVersion: auth.session.version,
        active: true,
        deletedAt: null,
        paymentStatus: "approved",
      },
      {
        $set: {
          reviewTaskStartedAt: startedAt,
          reviewDailyDate: businessDay.date,
          reviewDailyCount: dailyCount,
        },
      },
    );
    if (userUpdated.matchedCount !== 1) {
      return NextResponse.json({ error: "Your account is no longer active." }, { status: 409 });
    }
    return NextResponse.json({
      assignmentId: assignment._id.toString(),
      businessDate: businessDay.date,
      task: {
        title: task.title || "Review task",
        instructions: task.instructions || "",
        rulesText: task.rulesText || "",
        websiteUrl: task.websiteUrl || "",
        videoUrl: task.videoUrl || "",
        mediaImageUrl: task.mediaImagePublicId
          ? privateImageUrl(task.mediaImagePublicId, Math.floor(Date.now() / 1000) + 86400)
          : "",
        rewardMinor: assignment.rewardMinor ?? rewardMinor,
        allowImage: Boolean(task.allowImage),
        requireImage: Boolean(task.requireImage),
        allowLink: Boolean(task.allowLink),
        requireLink: Boolean(task.requireLink),
        allowVideoLinks: Boolean(task.allowVideoLinks),
        minimumSeconds: task.minimumSeconds || 0,
        cooldownSeconds: task.cooldownSeconds || 0,
        dailyLimit: dailyTaskLimit,
        dailyCount,
        dailyEarningLimitMinor,
        userTotalLimit: task.userTotalLimit || 0,
        userTotalCount,
        totalLimit: task.totalLimit || 0,
        completedCount: settings?.reviewTaskCompletedCount || 0,
        packageExpiresAt: packageTerm.expiresAt.toISOString(),
      },
      startedAt: startedAt.toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Starting review task failed:", error);
    return NextResponse.json({ error: "Review tasks are temporarily unavailable." }, { status: 500 });
  }
}
