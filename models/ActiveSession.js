import mongoose from "mongoose";

const activeSessionSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userAgent: { type: String, trim: true, maxlength: 500, default: "" },
    ipAddress: { type: String, trim: true, maxlength: 64, default: "" },
    lastSeenAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

activeSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });
const ActiveSession =
  mongoose.models.ActiveSession ||
  mongoose.model("ActiveSession", activeSessionSchema);

export default ActiveSession;
