import test from "node:test";
import assert from "node:assert/strict";
import ReviewTaskAssignment from "../models/ReviewTaskAssignment.js";
import Rating from "../models/Rating.js";
import {
  getTaskReviewRatingFilter,
  getTaskReviewTransition,
} from "../lib/review-task-assignments.js";

test("daily assignments are unique per user, business date, and slot", () => {
  const indexes = ReviewTaskAssignment.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.userId === 1 &&
        keys.businessDate === 1 &&
        keys.slot === 1 &&
        options.unique === true,
    ),
  );
  assert.deepEqual(
    ReviewTaskAssignment.schema.path("status").enumValues,
    ["active", "submitted", "approved", "rejected", "completed", "expired"],
  );
  assert.equal(ReviewTaskAssignment.schema.path("rewardMinor").options.immutable, true);
  assert.ok(ReviewTaskAssignment.schema.indexes().some(([keys]) =>
    keys.status === 1 && keys.createdAt === 1,
  ));
});

test("task completion links are unique while legacy ratings remain optional", () => {
  const indexes = Rating.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.taskAssignmentId === 1 &&
        options.unique === true &&
        options.sparse === true,
    ),
  );
  assert.equal(Rating.schema.path("taskAssignmentId").options.immutable, true);
  assert.equal(Rating.schema.path("taskBusinessDate").options.immutable, true);
  assert.equal(Rating.schema.path("taskRewardMinor").options.immutable, true);
  assert.ok(Rating.schema.indexes().some(([keys]) =>
    keys.moderationStatus === 1 && keys.taskAssignmentId === 1 && keys._id === -1,
  ));
});

test("task review decisions map to single-use approval and rejection states", () => {
  assert.deepEqual(getTaskReviewTransition("approve"), {
    assignmentStatus: "approved",
    moderationStatus: "visible",
  });
  assert.deepEqual(getTaskReviewTransition("reject"), {
    assignmentStatus: "rejected",
    moderationStatus: "removed",
  });
  assert.equal(getTaskReviewTransition("unknown"), null);
  assert.deepEqual(getTaskReviewRatingFilter(), {
    taskAssignmentId: { $exists: true, $ne: null },
    moderationStatus: "underReview",
  });
});
