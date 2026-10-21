import { NextResponse } from "next/server";
import Rating from "@/models/Rating";
import { getActiveRequestUser } from "@/lib/request-auth";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import { getRatingPage, isValidRatingCursor, serializeRating } from "@/lib/rating-data";
import PortalSettings from "@/models/PortalSettings";
import WalletTransaction from "@/models/WalletTransaction";
import WalletBalance from "@/models/WalletBalance";
import { getWalletBalanceSnapshot } from "@/lib/wallet-ledger";
import TrafficEvent from "@/models/TrafficEvent";
import { consumeRateLimit } from "@/lib/rate-limit";
import User from "@/models/User";
import { ensurePackageTerm } from "@/lib/package-term";
import { readPaymentProof } from "@/lib/payment-proof";
import { deleteCloudinaryAsset, uploadPrivateImage } from "@/lib/cloudinary";
import { createNotification } from "@/lib/notifications";
import { getBusinessDayRange } from "@/lib/business-time";
import ReviewTaskAssignment from "@/models/ReviewTaskAssignment";
import { currentTermsRequiredMessage, requiresCurrentTermsAcceptance } from "@/lib/legal-terms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TARGET_LENGTH = 120;
const MAX_REVIEW_LENGTH = 2000;
const ALLOWED_CATEGORIES = ["General", "Service", "Product", "Support", "Delivery", "Other"];

export async function GET(request) {
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const queue = searchParams.get("queue");
    if (!isValidRatingCursor(cursor)) {
      return NextResponse.json({ error: "Invalid pagination cursor." }, { status: 400 });
    }
    if (queue && queue !== "task-review") {
      return NextResponse.json({ error: "Invalid ratings queue." }, { status: 400 });
    }
    if (queue === "task-review" && auth.user.role === "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const page = await getRatingPage({
      role: auth.user.role,
      userId: auth.user._id,
      cursor,
      taskReviewQueue: queue === "task-review",
    });

    return NextResponse.json(
      page,
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Loading ratings failed:", error);
    return NextResponse.json(
      { error: "Ratings are temporarily unavailable." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const isMultipart = request.headers.get("content-type")?.includes("multipart/form-data");
  let body;
  let formData;
  if (isMultipart) {
    try {
      formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    } catch (error) {
      console.error("Reading multipart review submission failed:", error);
      return NextResponse.json({ error: "Could not read the review form data." }, { status: 400 });
    }
  } else {
    const parsed = await readJsonBody(request);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    body = parsed.body;
  }

  const targetName =
    typeof body.targetName === "string"
      ? body.targetName.trim()
      : "";
  const reviewText =
    typeof body.reviewText === "string"
      ? body.reviewText.trim()
      : "";
  const rating = isMultipart ? Number(body.rating) : body.rating;
  const category = body.category === undefined ? "General" : body.category;
  let tags = body.tags === undefined ? [] : body.tags;
  if (isMultipart && typeof tags === "string") {
    try { tags = JSON.parse(tags); } catch { tags = tags.split(",").map((tag) => tag.trim()).filter(Boolean); }
  }
  const evidenceUrl = typeof body.evidenceUrl === "string" ? body.evidenceUrl.trim() : "";
  const requestedAssignmentId =
    typeof body.taskAssignmentId === "string" ? body.taskAssignmentId : "";
  if (requestedAssignmentId && !/^[a-f\d]{24}$/i.test(requestedAssignmentId)) {
    return NextResponse.json({ error: "Start a new review task before submitting." }, { status: 409 });
  }
  let parsedEvidenceUrl;
  if (evidenceUrl) {
    try { parsedEvidenceUrl = new URL(evidenceUrl); } catch { parsedEvidenceUrl = null; }
  }

  if (
    !targetName ||
    targetName.length > MAX_TARGET_LENGTH ||
    !reviewText ||
    reviewText.length > MAX_REVIEW_LENGTH ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    !ALLOWED_CATEGORIES.includes(category) ||
    !Array.isArray(tags) ||
    tags.length > 8 ||
    tags.some((tag) => typeof tag !== "string" || tag.trim().length === 0 || tag.trim().length > 30) ||
    evidenceUrl.length > 2048 ||
    (evidenceUrl && (!parsedEvidenceUrl || parsedEvidenceUrl.protocol !== "https:"))
  ) {
    return NextResponse.json(
      {
        error:
          "Enter a name or service, a review of up to 2,000 characters, and a whole-star rating from 1 to 5.",
      },
      { status: 400 },
    );
  }

  let uploaded;
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (await requiresCurrentTermsAcceptance(auth.user)) {
      return NextResponse.json(
        { error: currentTermsRequiredMessage(), termsRequired: true },
        { status: 428 },
      );
    }
    const rate = await consumeRateLimit(request, "rating-create", {
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many rating submissions. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
      );
    }

    const settingsSnapshot = await PortalSettings.findOne({ key: "global" })
      .select("reviewTasks reviewTaskCompletedCount ratingRewardMinor businessTimeZone")
      .lean();
    const account = await User.findById(auth.user._id)
      .select("paymentStatus packageActivatedAt packageExpiresAt packageId packageDailyEarningLimitMinor packageDailyTaskQuota packageDailyTaskLimit packagePerTaskEarningsMinor ratingCount reviewTaskTotalCount +reviewTaskStartedAt lastReviewAt");
    const packageTerm = await ensurePackageTerm(account);
    if (!packageTerm.active) {
      return NextResponse.json({
        error: "Your registration package has expired. Renew your package to submit review tasks or earn rewards.",
        packageExpired: true,
        packageExpiresAt: packageTerm.expiresAt?.toISOString() || null,
      }, { status: 403 });
    }
    const task = settingsSnapshot?.reviewTasks || {};
    if (task.packageIds?.length && !task.packageIds.some((id) => id.toString() === auth.user.packageId?.toString())) {
      return NextResponse.json({ error: "Review tasks are not available for your registration package." }, { status: 403 });
    }
    const isVideoLink = parsedEvidenceUrl && (
      parsedEvidenceUrl.hostname === "youtu.be" ||
      parsedEvidenceUrl.hostname.endsWith(".youtube.com") ||
      parsedEvidenceUrl.hostname === "youtube.com" ||
      parsedEvidenceUrl.pathname.toLowerCase().endsWith(".mp4")
    );
    if (isVideoLink && !task.allowVideoLinks) {
      return NextResponse.json({ error: "Video links are not enabled for review tasks." }, { status: 400 });
    }
    if (task.requireLink && !evidenceUrl) {
      return NextResponse.json({ error: "Add the required HTTPS review link." }, { status: 400 });
    }
    if (evidenceUrl && !task.allowLink) {
      return NextResponse.json({ error: "Review links are not enabled for this task." }, { status: 400 });
    }
    const proofFile = isMultipart ? formData.get("proof") : null;
    const hasProof = typeof File !== "undefined" && proofFile instanceof File && proofFile.size > 0;
    if (task.requireImage && !hasProof) {
      return NextResponse.json({ error: "Upload the required review image." }, { status: 400 });
    }
    if (hasProof && !task.allowImage) {
      return NextResponse.json({ error: "Review image uploads are not enabled for this task." }, { status: 400 });
    }

    const userForTask = account;
    const taskNow = new Date();
    const preliminaryDay = getBusinessDayRange(taskNow, settingsSnapshot?.businessTimeZone || "UTC");
    const assignmentFilter = {
      userId: auth.user._id,
      businessDate: preliminaryDay.date,
      status: "active",
      expiresAt: { $gt: taskNow },
    };
    if (requestedAssignmentId) assignmentFilter._id = requestedAssignmentId;
    const taskAssignment = await ReviewTaskAssignment.findOne(assignmentFilter).select("startedAt rewardMinor");
    if (!taskAssignment) {
      return NextResponse.json({ error: "This task has expired. Start today's task before submitting." }, { status: 409 });
    }
    const startedAt = taskAssignment.startedAt;
    const taskDurationSeconds = startedAt
      ? Math.max(0, Math.floor((taskNow.getTime() - new Date(startedAt).getTime()) / 1000))
      : 0;
    if ((task.minimumSeconds || 0) > taskDurationSeconds) {
      return NextResponse.json({ error: `Spend at least ${task.minimumSeconds} seconds on the review task before submitting.` }, { status: 400 });
    }
    const lastReviewAt = userForTask?.lastReviewAt ? new Date(userForTask.lastReviewAt) : null;
    if (lastReviewAt && task.cooldownSeconds > 0 && taskNow.getTime() - lastReviewAt.getTime() < task.cooldownSeconds * 1000) {
      return NextResponse.json({ error: "Your review cooldown is still active." }, { status: 429 });
    }
    if (hasProof) {
      const image = await readPaymentProof(formData);
      if (image.error) return NextResponse.json({ error: image.error.replace("Payment proof", "Review evidence") }, { status: 400 });
      uploaded = await uploadPrivateImage(image.bytes, { folder: "ratewell/review-evidence" });
    }

    const session = await Rating.startSession();
    let created;
    try {
      await session.withTransaction(async () => {
        const settings = await PortalSettings.findOne({ key: "global" }).session(session);
        const reviewTasks = settings?.reviewTasks || {};
        if (reviewTasks.packageIds?.length && !reviewTasks.packageIds.some((id) => id.toString() === auth.user.packageId?.toString())) {
          const error = new Error("Review tasks are not available for your registration package.");
          error.statusCode = 403;
          throw error;
        }
        const submittedAt = new Date();
        const businessDay = getBusinessDayRange(submittedAt, settings?.businessTimeZone || "UTC");
        const activeAssignmentFilter = {
          userId: auth.user._id,
          businessDate: businessDay.date,
          status: "active",
          expiresAt: { $gt: submittedAt },
        };
        if (requestedAssignmentId) activeAssignmentFilter._id = requestedAssignmentId;
        const activeAssignment = await ReviewTaskAssignment.findOne(activeAssignmentFilter)
          .session(session);
        if (!activeAssignment) {
          const error = new Error("This task has expired. Start today's task before submitting.");
          error.statusCode = 409;
          throw error;
        }
        const transactionUser = await User.findById(auth.user._id)
          .select("+reviewTaskStartedAt lastReviewAt paymentStatus packageActivatedAt packageExpiresAt packageId packageDailyEarningLimitMinor packageDailyTaskQuota packageDailyTaskLimit packagePerTaskEarningsMinor ratingCount reviewTaskTotalCount")
          .session(session)
          .lean();
        const transactionPackageTerm = await ensurePackageTerm(transactionUser, session);
        if (!transactionPackageTerm.active) {
          const error = new Error("Your registration package has expired. Renew your package to submit review tasks or earn rewards.");
          error.statusCode = 403;
          throw error;
        }
        const transactionTaskDuration = activeAssignment.startedAt
          ? Math.max(0, Math.floor((submittedAt.getTime() - activeAssignment.startedAt.getTime()) / 1000))
          : 0;
        if ((reviewTasks.minimumSeconds || 0) > transactionTaskDuration) {
          const error = new Error(`Spend at least ${reviewTasks.minimumSeconds} seconds on the review task before submitting.`);
          error.statusCode = 400;
          throw error;
        }
        if (
          transactionUser?.lastReviewAt &&
          reviewTasks.cooldownSeconds > 0 &&
          submittedAt.getTime() - new Date(transactionUser.lastReviewAt).getTime() < reviewTasks.cooldownSeconds * 1000
        ) {
          const error = new Error("Your review cooldown is still active.");
          error.statusCode = 429;
          throw error;
        }
        const day = businessDay.date;
        const dailyCount = await Rating.countDocuments({
          userId: auth.user._id,
          createdAt: { $gte: businessDay.start, $lt: businessDay.end },
        }).session(session);
        const configuredTaskCaps = [reviewTasks.dailyLimit, transactionUser.packageDailyTaskLimit ?? transactionUser.packageDailyTaskQuota].filter((value) => value > 0);
        const dailyTaskLimit = configuredTaskCaps.length ? Math.min(...configuredTaskCaps) : 0;
        if (dailyTaskLimit > 0 && dailyCount >= dailyTaskLimit) {
          const error = new Error("You have reached today's review task limit.");
          error.statusCode = 429;
          throw error;
        }
        const reward = activeAssignment.rewardMinor ??
          (
            transactionUser.packagePerTaskEarningsMinor ||
            reviewTasks.rewardMinor ||
            settings?.ratingRewardMinor ||
            0
          );
        if (!Number.isSafeInteger(reward) || reward < 0) {
          throw new Error("The task reward snapshot is invalid; manual reconciliation is required.");
        }
        if (transactionUser.packageDailyEarningLimitMinor > 0) {
          const [earningUsage, pendingUsage] = await Promise.all([
            WalletTransaction.aggregate([
              {
                $match: {
                  userId: auth.user._id,
                  type: "ratingReward",
                  status: "completed",
                  $or: [
                    { businessDate: day },
                    {
                      businessDate: { $in: ["", null] },
                      createdAt: { $gte: businessDay.start, $lt: businessDay.end },
                    },
                  ],
                },
              },
              { $group: { _id: null, totalMinor: { $sum: "$amountMinor" } } },
            ]).session(session),
            ReviewTaskAssignment.aggregate([
              {
                $match: {
                  userId: auth.user._id,
                  businessDate: day,
                  status: "submitted",
                },
              },
              { $group: { _id: null, totalMinor: { $sum: { $ifNull: ["$rewardMinor", 0] } } } },
            ]).session(session),
          ]);
          const earnedMinor = earningUsage[0]?.totalMinor || 0;
          const pendingMinor = pendingUsage[0]?.totalMinor || 0;
          if (earnedMinor + pendingMinor + reward > transactionUser.packageDailyEarningLimitMinor) {
            const error = new Error("You have reached your package's daily earning limit.");
            error.statusCode = 409;
            throw error;
          }
        }
        let userTotal = transactionUser.reviewTaskTotalCount || transactionUser.ratingCount || 0;
        if (userTotal === 0) {
          userTotal = await Rating.countDocuments({ userId: auth.user._id }).session(session);
        }
        if (reviewTasks.userTotalLimit > 0 && userTotal >= reviewTasks.userTotalLimit) {
          const error = new Error("You have reached your total review task limit.");
          error.statusCode = 409;
          throw error;
        }
        if (settings) {
          if (settings.reviewTaskCompletedCount === null || settings.reviewTaskCompletedCount === undefined) {
            const existingCount = await Rating.countDocuments({}).session(session);
            settings.reviewTaskCompletedCount = existingCount;
            await settings.save({ session });
          }
          if (reviewTasks.totalLimit > 0 && settings.reviewTaskCompletedCount >= reviewTasks.totalLimit) {
            const error = new Error("The review task quota has been reached.");
            error.statusCode = 409;
            throw error;
          }
          settings.reviewTaskCompletedCount += 1;
          await settings.save({ session });
        }
        [created] = await Rating.create(
          [
            {
              userId: auth.user._id,
              taskAssignmentId: activeAssignment._id,
              taskBusinessDate: day,
              targetName,
              rating,
              reviewText,
              category,
              tags: tags.map((tag) => tag.trim()),
              evidenceUrl,
              evidenceImagePublicId: uploaded?.publicId || "",
              taskDurationSeconds: transactionTaskDuration,
              taskRewardMinor: reward,
              moderationStatus: "visible",
            },
          ],
          { session },
        );
        const assignmentUpdate = await ReviewTaskAssignment.updateOne(
          {
            _id: activeAssignment._id,
            userId: auth.user._id,
            businessDate: day,
            status: "active",
            expiresAt: { $gt: submittedAt },
          },
          {
            $set: {
              status: "approved",
              submittedAt,
              reviewedAt: submittedAt,
              completedAt: submittedAt,
              ratingId: created._id,
            },
          },
          { session },
        );
        if (assignmentUpdate.modifiedCount !== 1) {
          const error = new Error("This task was already completed or has expired.");
          error.statusCode = 409;
          throw error;
        }
        if (reward > 0) {
          const balance = await WalletBalance.findOneAndUpdate(
            {
              userId: auth.user._id,
              balanceMinor: { $lte: Number.MAX_SAFE_INTEGER - reward },
            },
            {
              $inc: { balanceMinor: reward },
              $setOnInsert: { currency: "PKR" },
            },
            { upsert: true, new: true, session },
          );
          await WalletTransaction.create(
            [
              {
                userId: auth.user._id,
                type: "ratingReward",
                direction: "credit",
                amountMinor: reward,
                currency: "PKR",
                businessDate: day,
                status: "completed",
                referenceId: created._id,
                idempotencyKey: `rating:${created._id.toString()}`,
                description: `Reward for rating ${targetName}`,
                createdBy: auth.user._id,
                ...getWalletBalanceSnapshot(balance, "earning", "credit", reward),
              },
            ],
            { session },
          );
        }
        const userUpdate = await User.updateOne(
          {
            _id: auth.user._id,
            role: "user",
            active: true,
            deletedAt: null,
            paymentStatus: "approved",
            sessionVersion: auth.session.version,
            reviewTaskStartedAt: transactionUser.reviewTaskStartedAt,
          },
          {
            $inc: {
              ratingCount: 1,
              reviewTaskTotalCount: 1,
            },
            $set: {
              lastReviewAt: submittedAt,
              reviewDailyDate: day,
              reviewDailyCount: dailyCount + 1,
              reviewTaskStartedAt: null,
            },
          },
          { session },
        );
        if (userUpdate.modifiedCount !== 1) {
          const error = new Error("Your account is no longer active.");
          error.statusCode = 409;
          throw error;
        }
        await createNotification(
          {
            userId: auth.user._id,
            type: "task",
            title: reward > 0 ? "Task completed" : "Review submitted",
            message: reward > 0
              ? `${reward} paisa was credited to your wallet for completing the review task.`
              : "Your review was submitted successfully.",
          },
          session,
        );
        await TrafficEvent.create(
          [{ type: "rating", path: "/dashboard", visitorHash: "" }],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json(
      { rating: serializeRating(created.toObject()) },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (uploaded?.publicId) {
      try {
        await deleteCloudinaryAsset(uploaded.publicId);
      } catch (cleanupError) {
        console.error("Cleaning up failed review evidence upload failed:", cleanupError);
      }
    }
    if (error.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Submitting rating failed:", error);
    return NextResponse.json(
      { error: "Your rating could not be submitted. Please try again." },
      { status: 500 },
    );
  }
}
