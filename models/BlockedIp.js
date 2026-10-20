import mongoose from "mongoose";

const blockedIpSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, unique: true, trim: true, maxlength: 64 },
    reason: { type: String, trim: true, maxlength: 300, required: true },
    blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const BlockedIp = mongoose.models.BlockedIp || mongoose.model("BlockedIp", blockedIpSchema);

export default BlockedIp;
