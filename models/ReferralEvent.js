import mongoose from "mongoose";

const referralEventSchema = new mongoose.Schema(
  {
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    referredUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: ["click", "registration", "conversion"],
      required: true,
      index: true,
    },
    level: { type: Number, min: 1, max: 10, default: 1 },
    visitorHash: { type: String, trim: true, maxlength: 128, default: "" },
    ipAddress: { type: String, trim: true, maxlength: 64, default: "" },
    userAgent: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

referralEventSchema.index({ referrerId: 1, createdAt: -1 });
referralEventSchema.index({ referrerId: 1, type: 1, createdAt: -1, level: 1 });
const ReferralEvent =
  mongoose.models.ReferralEvent ||
  mongoose.model("ReferralEvent", referralEventSchema);

export default ReferralEvent;
