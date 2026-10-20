import mongoose from "mongoose";

const paymentReferenceSchema = new mongoose.Schema(
  {
    transactionIdKey: { type: String, required: true, maxlength: 120, immutable: true },
    sourceType: { type: String, enum: ["deposit", "packagePayment"], required: true, immutable: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

paymentReferenceSchema.index({ transactionIdKey: 1 }, { unique: true });
paymentReferenceSchema.index({ sourceType: 1, sourceId: 1 }, { unique: true });

const PaymentReference =
  mongoose.models.PaymentReference ||
  mongoose.model("PaymentReference", paymentReferenceSchema);

export default PaymentReference;
