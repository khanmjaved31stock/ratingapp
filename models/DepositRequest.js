import mongoose from "mongoose";

const depositRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
    paymentAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentAccount", required: true, immutable: true },
    amountMinor: { type: Number, required: true, min: 100, max: 100000000, immutable: true },
    transactionId: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
    senderName: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
    senderAccountNumber: { type: String, required: true, trim: true, maxlength: 64, immutable: true },
    submissionIpAddress: { type: String, trim: true, maxlength: 64, default: "", immutable: true },
    approvalIpAddress: { type: String, trim: true, maxlength: 64, default: "" },
    proofUrl: { type: String, required: true, maxlength: 2048, immutable: true },
    proofPublicId: { type: String, required: true, maxlength: 300, immutable: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true },
);

depositRequestSchema.index({ transactionId: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
depositRequestSchema.index({ status: 1, createdAt: 1 });
depositRequestSchema.index({
  transactionId: "text",
  senderName: "text",
});
const DepositRequest = mongoose.models.DepositRequest || mongoose.model("DepositRequest", depositRequestSchema);

export default DepositRequest;
