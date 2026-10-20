import mongoose from "mongoose";

const reviewTaskAssignmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    businessDate: {
      type: String,
      required: true,
      immutable: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    slot: { type: Number, required: true, min: 0, immutable: true },
    status: {
      type: String,
      enum: ["active", "submitted", "approved", "rejected", "completed", "expired"],
      required: true,
      default: "active",
    },
    startedAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true },
    rewardMinor: { type: Number, min: 0, max: 1000000, default: null, immutable: true },
    submittedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    expiredAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewNote: { type: String, trim: true, maxlength: 500, default: "" },
    ratingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rating",
      default: null,
    },
  },
  { timestamps: true },
);

reviewTaskAssignmentSchema.index(
  { userId: 1, businessDate: 1, slot: 1 },
  { unique: true },
);
reviewTaskAssignmentSchema.index({ userId: 1, businessDate: 1, status: 1 });
reviewTaskAssignmentSchema.index({ status: 1, createdAt: 1 });

const ReviewTaskAssignment =
  mongoose.models.ReviewTaskAssignment ||
  mongoose.model("ReviewTaskAssignment", reviewTaskAssignmentSchema);

export default ReviewTaskAssignment;
