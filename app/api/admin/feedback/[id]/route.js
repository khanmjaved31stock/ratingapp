import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import { createNotification } from "@/lib/notifications";
import { getTaskReviewTransition } from "@/lib/review-task-assignments";
import Rating from "@/models/Rating";
import ReviewTaskAssignment from "@/models/ReviewTaskAssignment";
import WalletBalance from "@/models/WalletBalance";
import WalletTransaction from "@/models/WalletTransaction";
import { getWalletBalanceSnapshot } from "@/lib/wallet-ledger";

export const runtime = "nodejs";

export async function PATCH(request, { params }) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const { id } = await params;
  if (!mongoose.isValidObjectId(id) || new mongoose.Types.ObjectId(id).toString() !== id) {
    return NextResponse.json({ error: "Invalid rating identifier." }, { status: 400 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { flagged, moderationStatus, taskDecision, reviewNote } = parsed.body;
  const taskTransition = taskDecision === undefined
    ? null
    : getTaskReviewTransition(taskDecision);
  if (
    (flagged !== undefined && typeof flagged !== "boolean") ||
    (moderationStatus !== undefined &&
      !["visible", "underReview", "removed"].includes(moderationStatus)) ||
    (taskDecision !== undefined && !taskTransition) ||
    (taskDecision !== undefined && (flagged !== undefined || moderationStatus !== undefined)) ||
    (reviewNote !== undefined &&
      (taskDecision === undefined || typeof reviewNote !== "string" || reviewNote.length > 500)) ||
    (taskDecision === "reject" && !reviewNote?.trim()) ||
    (flagged === undefined && moderationStatus === undefined && taskDecision === undefined)
  ) {
    return NextResponse.json({ error: "Invalid feedback moderation action." }, { status: 400 });
  }
  try {
    const auth = await requireStaff(request, ["superAdmin", "helpAdmin", "moderator"]);
    if (auth.response) return auth.response;
    if (taskDecision) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const rating = await Rating.findOne({
            _id: id,
            taskAssignmentId: { $ne: null },
            moderationStatus: "underReview",
          }).session(session);
          if (!rating) {
            const error = new Error("This task is not awaiting staff review.");
            error.statusCode = 409;
            throw error;
          }

          const reviewedAt = new Date();
          const assignment = await ReviewTaskAssignment.findOneAndUpdate(
            { ratingId: rating._id, status: "submitted" },
            {
              $set: {
                status: taskTransition.assignmentStatus,
                reviewedAt,
                reviewedBy: auth.user._id,
                reviewNote: reviewNote?.trim() || "",
                ...(taskDecision === "approve" ? { completedAt: reviewedAt } : {}),
              },
            },
            { new: true, session },
          );
          if (!assignment) {
            const error = new Error("This task is no longer awaiting review.");
            error.statusCode = 409;
            throw error;
          }
          if (
            !Number.isSafeInteger(rating.taskRewardMinor) ||
            rating.taskRewardMinor < 0 ||
            (assignment.rewardMinor !== null &&
              assignment.rewardMinor !== undefined &&
              assignment.rewardMinor !== rating.taskRewardMinor)
          ) {
            throw new Error("The task reward snapshot does not reconcile; manual review is required.");
          }

          const ratingUpdate = await Rating.updateOne(
            { _id: rating._id, moderationStatus: "underReview" },
            { $set: { moderationStatus: taskTransition.moderationStatus } },
            { session },
          );
          if (ratingUpdate.modifiedCount !== 1) {
            const error = new Error("This task is no longer awaiting review.");
            error.statusCode = 409;
            throw error;
          }

          if (taskDecision === "approve" && rating.taskRewardMinor > 0) {
            const balance = await WalletBalance.findOneAndUpdate(
              {
                userId: rating.userId,
                balanceMinor: { $lte: Number.MAX_SAFE_INTEGER - rating.taskRewardMinor },
              },
              {
                $inc: { balanceMinor: rating.taskRewardMinor },
                $setOnInsert: { currency: "PKR" },
              },
              { upsert: true, new: true, session },
            );
            await WalletTransaction.create(
              [
                {
                  userId: rating.userId,
                  type: "ratingReward",
                  direction: "credit",
                  amountMinor: rating.taskRewardMinor,
                  currency: "PKR",
                  businessDate: assignment.businessDate,
                  status: "completed",
                  referenceId: rating._id,
                  idempotencyKey: `rating:${rating._id.toString()}`,
                  description: `Approved reward for rating ${rating.targetName}`,
                  createdBy: auth.user._id,
                  ...getWalletBalanceSnapshot(balance, "earning", "credit", rating.taskRewardMinor),
                },
              ],
              { session },
            );
          }

          await createNotification(
            {
              userId: rating.userId,
              type: "task",
              title: taskDecision === "approve" ? "Review task approved" : "Review task rejected",
              message: taskDecision === "approve"
                ? rating.taskRewardMinor > 0
                  ? `Your review was approved and ${rating.taskRewardMinor} paisa was credited to your wallet.`
                  : "Your review was approved."
                : `Your review was rejected. ${reviewNote.trim()}`,
            },
            session,
          );
          await writeAdminAudit(request, auth, `task.${taskDecision}`, {
            type: "Rating",
            id,
            metadata: {
              assignmentId: assignment._id.toString(),
              rewardMinor: rating.taskRewardMinor,
              reviewNote: reviewNote?.trim() || "",
            },
            session,
          });
        });
        return NextResponse.json({
          message: taskDecision === "approve" ? "Task approved and reward credited." : "Task rejected.",
          moderationStatus: taskTransition.moderationStatus,
        });
      } finally {
        await session.endSession();
      }
    }

    const pendingAssignment = await ReviewTaskAssignment.exists({
      ratingId: id,
      status: "submitted",
    });
    if (pendingAssignment && moderationStatus !== undefined) {
      return NextResponse.json(
        { error: "Use the task approval or rejection action to resolve a pending task." },
        { status: 409 },
      );
    }
    const update = {};
    if (flagged !== undefined) update.flagged = flagged;
    if (moderationStatus) update.moderationStatus = moderationStatus;
    const rating = await Rating.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!rating) return NextResponse.json({ error: "Rating not found." }, { status: 404 });
    await writeAdminAudit(request, auth, "rating.moderated", {
      type: "Rating",
      id,
      metadata: update,
    });
    return NextResponse.json({ message: "Feedback moderation saved." });
  } catch (error) {
    if (error.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Moderating rating failed:", error);
    return NextResponse.json({ error: "Could not update rating moderation." }, { status: 500 });
  }
}
