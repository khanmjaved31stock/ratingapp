export function getPreviousActiveAssignmentFilter(userId, currentBusinessDate) {
  if (
    !userId ||
    typeof currentBusinessDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(currentBusinessDate)
  ) {
    throw new TypeError("A user and current business date are required.");
  }
  return {
    userId,
    status: "active",
    businessDate: { $lt: currentBusinessDate },
  };
}

export function getTaskReviewTransition(decision) {
  if (decision === "approve") {
    return { assignmentStatus: "approved", moderationStatus: "visible" };
  }
  if (decision === "reject") {
    return { assignmentStatus: "rejected", moderationStatus: "removed" };
  }
  return null;
}

export function getTaskReviewRatingFilter() {
  return {
    taskAssignmentId: { $exists: true, $ne: null },
    moderationStatus: "underReview",
  };
}
