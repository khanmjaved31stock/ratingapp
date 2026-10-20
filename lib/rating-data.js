import mongoose from "mongoose";
import Rating from "@/models/Rating";
import { privateImageUrl } from "@/lib/cloudinary";
import { getTaskReviewRatingFilter } from "@/lib/review-task-assignments";

const PAGE_SIZE = 50;

export function isValidRatingCursor(cursor) {
  return (
    !cursor ||
    (mongoose.isValidObjectId(cursor) &&
      new mongoose.Types.ObjectId(cursor).toString() === cursor)
  );
}

export function serializeRating(rating) {
  const user = rating.userId;
  const taskAssignment = rating.taskAssignmentId &&
    !(rating.taskAssignmentId instanceof mongoose.Types.ObjectId)
    ? rating.taskAssignmentId
    : null;
  return {
    id: rating._id.toString(),
    targetName: rating.targetName,
    rating: rating.rating,
    reviewText: rating.reviewText,
    category: rating.category || "General",
    tags: rating.tags || [],
    evidenceUrl: rating.evidenceUrl || "",
    evidenceImageUrl: rating.evidenceImagePublicId
      ? privateImageUrl(rating.evidenceImagePublicId, Math.floor(Date.now() / 1000) + 300)
      : "",
    flagged: Boolean(rating.flagged),
    moderationStatus: rating.moderationStatus || "visible",
    taskAssignmentId: taskAssignment
      ? taskAssignment._id.toString()
      : rating.taskAssignmentId?.toString() || "",
    taskRewardMinor: rating.taskRewardMinor || 0,
    taskReviewStatus: taskAssignment?.status || "",
    taskReviewNote: taskAssignment?.reviewNote || "",
    taskReviewedAt: taskAssignment?.reviewedAt?.toISOString?.() || null,
    createdAt: rating.createdAt.toISOString(),
    author:
      user && typeof user === "object" && !user.deletedAt
        ? { name: user.name, email: user.email }
        : null,
  };
}

export async function getRatingPage({ role, userId, cursor = null, taskReviewQueue = false }) {
  const filter = {};
  if (role === "user") filter.userId = userId;
  else if (taskReviewQueue) Object.assign(filter, getTaskReviewRatingFilter());
  else filter.moderationStatus = { $ne: "removed" };
  if (cursor) filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };

  let query = Rating.find(filter).sort({ _id: -1 }).limit(PAGE_SIZE + 1);
  if (role !== "user") query = query.populate("userId", "name email deletedAt");
  else query = query.populate("taskAssignmentId", "status reviewNote reviewedAt");

  const results = await query.lean();
  const hasMore = results.length > PAGE_SIZE;
  const ratings = results.slice(0, PAGE_SIZE);

  return {
    ratings: ratings.map(serializeRating),
    hasMore,
    nextCursor: hasMore ? ratings.at(-1)._id.toString() : null,
  };
}
