import mongoose from "mongoose";

const withdrawalOtpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    sessionJti: { type: String, required: true, maxlength: 64 },
    codeHash: { type: String, required: true, select: false },
    attempts: { type: Number, default: 0, min: 0, max: 5 },
    expiresAt: { type: Date, required: true },
    verifiedUntil: { type: Date, default: null },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

withdrawalOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const WithdrawalOtp =
  mongoose.models.WithdrawalOtp ||
  mongoose.model("WithdrawalOtp", withdrawalOtpSchema);

export default WithdrawalOtp;
