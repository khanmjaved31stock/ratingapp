import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["withdrawal", "referral", "task", "package", "wallet"],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    readAt: { type: Date, default: null },
    dedupeKey: { type: String, trim: true, maxlength: 180, unique: true, sparse: true },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, _id: -1 });
notificationSchema.index({ userId: 1, readAt: 1, _id: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Notification =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);

export default Notification;
