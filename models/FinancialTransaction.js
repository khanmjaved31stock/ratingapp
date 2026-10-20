import mongoose from "mongoose";

const financialTransactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["packageRevenue", "deposit", "payout", "withdrawalFee", "expense", "adjustment"],
      required: true,
      index: true,
      immutable: true,
    },
    amountMinor: { type: Number, required: true, min: 1, immutable: true },
    currency: { type: String, enum: ["PKR"], default: "PKR" },
    status: {
      type: String,
      enum: ["pending", "completed", "rejected"],
      default: "completed",
      index: true,
    },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
    paymentVerificationId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentVerification", default: null, immutable: true },
    registrationSnapshot: {
      transactionId: { type: String, trim: true, maxlength: 120, default: "", immutable: true },
      senderName: { type: String, trim: true, maxlength: 120, default: "", immutable: true },
      senderAccountNumber: { type: String, trim: true, maxlength: 64, default: "", immutable: true },
      packageName: { type: String, trim: true, maxlength: 100, default: "", immutable: true },
      packageDescription: { type: String, trim: true, maxlength: 500, default: "", immutable: true },
      packageBenefits: {
        type: [{ type: String, trim: true, maxlength: 200 }],
        default: [],
        immutable: true,
        validate: (items) => items.length <= 20,
      },
      packageId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
      packagePriceMinor: { type: Number, min: 0, default: 0, immutable: true },
      submittedAt: { type: Date, default: null, immutable: true },
      submissionIpAddress: { type: String, trim: true, maxlength: 64, default: "", immutable: true },
      approvedAt: { type: Date, default: null, immutable: true },
      approvalIpAddress: { type: String, trim: true, maxlength: 64, default: "", immutable: true },
    },
    idempotencyKey: { type: String, unique: true, sparse: true, immutable: true },
    description: { type: String, trim: true, maxlength: 240, required: true, immutable: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

financialTransactionSchema.index({ createdAt: -1 });
financialTransactionSchema.index({ type: 1, status: 1, createdAt: -1 });
const FinancialTransaction =
  mongoose.models.FinancialTransaction ||
  mongoose.model("FinancialTransaction", financialTransactionSchema);

export default FinancialTransaction;
