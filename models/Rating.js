import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    taskAssignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReviewTaskAssignment",
      default: null,
      immutable: true,
    },
    taskBusinessDate: {
      type: String,
      default: "",
      maxlength: 10,
      immutable: true,
    },
    taskRewardMinor: { type: Number, default: 0, min: 0, max: 1000000, immutable: true },
    targetName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "Rating must be a whole number from 1 to 5.",
      },
    },
    reviewText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    category: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "General",
    },
    tags: {
      type: [{ type: String, trim: true, maxlength: 30 }],
      default: [],
      validate: {
        validator: (tags) => tags.length <= 8,
        message: "A rating can have at most 8 tags.",
      },
    },
    evidenceUrl: { type: String, trim: true, maxlength: 2048, default: "" },
    evidenceImagePublicId: { type: String, trim: true, maxlength: 300, default: "" },
    taskDurationSeconds: { type: Number, min: 0, max: 86400, default: 0 },
    flagged: {
      type: Boolean,
      default: false,
    },
    moderationStatus: {
      type: String,
      enum: ["visible", "underReview", "removed"],
      default: "visible",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

ratingSchema.index({ userId: 1, _id: -1 });
ratingSchema.index(
  { taskAssignmentId: 1 },
  { unique: true, sparse: true },
);
ratingSchema.index({ moderationStatus: 1, taskAssignmentId: 1, _id: -1 });

const Rating =
  mongoose.models.Rating || mongoose.model("Rating", ratingSchema);

export default Rating;
