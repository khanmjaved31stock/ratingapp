import mongoose from "mongoose";

const packageWithdrawalFeeBracketSchema = new mongoose.Schema(
  {
    minimumAmountMinor: { type: Number, required: true, min: 100, max: 100000000, immutable: true },
    maximumAmountMinor: { type: Number, default: null, min: 100, max: 100000000, immutable: true },
    basisPoints: { type: Number, required: true, min: 0, max: 9999, immutable: true },
  },
  { _id: false },
);

const paymentVerificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      index: true,
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RegistrationPackage",
      required: true,
      immutable: true,
    },
    packagePriceMinor: { type: Number, required: true, min: 0, immutable: true },
    packageValidityDays: { type: Number, default: 30, min: 1, max: 365, immutable: true },
    packageDailyEarningLimitMinor: { type: Number, default: 0, min: 0, max: 100000000, immutable: true },
    packageDailyTaskQuota: { type: Number, default: 0, min: 0, max: 1000, immutable: true },
    packageDailyTaskLimit: { type: Number, default: null, min: 0, max: 1000, immutable: true },
    packagePerTaskEarningsMinor: { type: Number, default: 0, min: 0, max: 1000000, immutable: true },
    packageWithdrawalMinimumMinor: { type: Number, default: 100, min: 100, max: 100000000, immutable: true },
    packageWithdrawalMaximumMinor: { type: Number, default: null, min: 100, max: 100000000, immutable: true },
    packageWithdrawalFeeBrackets: {
      type: [packageWithdrawalFeeBracketSchema],
      default: () => [{ minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 }],
      immutable: true,
    },
    purchaseType: { type: String, enum: ["registration", "renewal"], default: "registration", immutable: true },
    packageName: { type: String, trim: true, maxlength: 100, default: "", immutable: true },
    packageDescription: { type: String, trim: true, maxlength: 500, default: "", immutable: true },
    packageBenefits: {
      type: [{ type: String, trim: true, maxlength: 200 }],
      default: [],
      immutable: true,
      validate: (items) => items.length <= 20,
    },
    currency: { type: String, enum: ["PKR"], default: "PKR" },
    paymentAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentAccount",
      required: true,
    },
    transactionId: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
    senderName: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
    senderAccountNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      immutable: true,
    },
    submissionIpAddress: { type: String, trim: true, maxlength: 64, default: "", immutable: true },
    approvalIpAddress: { type: String, trim: true, maxlength: 64, default: "" },
    approvedAt: { type: Date, default: null },
    proofUrl: { type: String, required: true, maxlength: 2048, immutable: true },
    proofPublicId: { type: String, required: true, maxlength: 300, immutable: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true },
);

paymentVerificationSchema.index(
  { transactionId: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);
paymentVerificationSchema.index({ status: 1, createdAt: 1 });
paymentVerificationSchema.index({
  packageName: "text",
  transactionId: "text",
  senderName: "text",
});

const PaymentVerification =
  mongoose.models.PaymentVerification ||
  mongoose.model("PaymentVerification", paymentVerificationSchema);

export default PaymentVerification;
