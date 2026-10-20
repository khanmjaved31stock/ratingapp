import mongoose from "mongoose";

const passwordResetOtpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    codeHash: { type: String, required: true, select: false },
    purpose: { type: String, enum: ["passwordReset", "emailVerification"], default: "passwordReset" },
    attempts: { type: Number, default: 0, min: 0, max: 5 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

passwordResetOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const PasswordResetOtp =
  mongoose.models.PasswordResetOtp ||
  mongoose.model("PasswordResetOtp", passwordResetOtpSchema);

export default PasswordResetOtp;
