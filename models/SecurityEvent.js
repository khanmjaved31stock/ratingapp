import mongoose from "mongoose";

const securityEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "loginFailed",
        "loginSucceeded",
        "accountLocked",
        "ipBlocked",
        "paymentRejected",
        "privilegeChanged",
        "sessionRevoked",
        "passwordChanged",
        "passwordResetSucceeded",
        "emailVerified",
        "payoutProfileCreated",
        "payoutProfileChanged",
      ],
      required: true,
      index: true,
    },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    ipAddress: { type: String, trim: true, maxlength: 64, default: "" },
    userAgent: { type: String, trim: true, maxlength: 500, default: "" },
    details: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

securityEventSchema.index({ createdAt: -1 });
const SecurityEvent =
  mongoose.models.SecurityEvent ||
  mongoose.model("SecurityEvent", securityEventSchema);

export default SecurityEvent;
