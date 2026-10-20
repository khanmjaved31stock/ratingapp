import mongoose from "mongoose";

const withdrawalFeeBracketSchema = new mongoose.Schema(
  {
    minimumAmountMinor: { type: Number, required: true, min: 100, max: 100000000, immutable: true },
    maximumAmountMinor: { type: Number, default: null, min: 100, max: 100000000, immutable: true },
    basisPoints: { type: Number, required: true, min: 0, max: 9999, immutable: true },
  },
  { _id: false },
);

const withdrawalPolicySnapshotSchema = new mongoose.Schema(
  {
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: "RegistrationPackage", default: null, immutable: true },
    packageName: { type: String, trim: true, maxlength: 100, default: "", immutable: true },
    minimumWithdrawalMinor: { type: Number, required: true, min: 100, max: 100000000, immutable: true },
    maximumWithdrawalMinor: { type: Number, default: null, min: 100, max: 100000000, immutable: true },
    feeBrackets: { type: [withdrawalFeeBracketSchema], required: true, immutable: true },
    appliedFeeBasisPoints: { type: Number, required: true, min: 0, max: 9999, immutable: true },
  },
  { _id: false },
);

const withdrawalRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amountMinor: { type: Number, required: true, min: 100, immutable: true },
    currency: { type: String, enum: ["PKR"], default: "PKR" },
    provider: {
      type: String,
      enum: ["easypaisa", "jazzcash", "bank", "usdtBep20", "usdtTrc20"],
      required: true,
      immutable: true,
    },
    encryptedPayoutDetails: { type: String, required: true, select: false, immutable: true },
    feeMinor: { type: Number, required: true, min: 0, default: 0, immutable: true },
    feeBasisPoints: { type: Number, required: true, min: 0, max: 9999, default: 0, immutable: true },
    payoutMinor: { type: Number, required: true, min: 1, immutable: true },
    withdrawalPolicySnapshot: { type: withdrawalPolicySnapshotSchema, default: null, immutable: true },
    status: {
      type: String,
      enum: ["pending", "processing", "paid", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, trim: true, maxlength: 500, default: "" },
    payoutReference: { type: String, trim: true, maxlength: 120, default: "" },
  },
  { timestamps: true },
);

withdrawalRequestSchema.index({ status: 1, createdAt: 1 });
withdrawalRequestSchema.index({
  provider: "text",
  payoutReference: "text",
  reviewNote: "text",
});
const WithdrawalRequest =
  mongoose.models.WithdrawalRequest ||
  mongoose.model("WithdrawalRequest", withdrawalRequestSchema);

export default WithdrawalRequest;
