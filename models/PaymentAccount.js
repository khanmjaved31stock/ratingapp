import mongoose from "mongoose";

const paymentAccountSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ["easypaisa", "jazzcash", "bank"],
      required: true,
    },
    displayName: { type: String, required: true, trim: true, maxlength: 100 },
    accountTitle: { type: String, required: true, trim: true, maxlength: 120 },
    accountNumber: { type: String, required: true, trim: true, maxlength: 64 },
    bankName: { type: String, trim: true, maxlength: 100, default: "" },
    instructions: { type: String, trim: true, maxlength: 1000, default: "" },
    qrPublicId: { type: String, trim: true, maxlength: 300, default: "" },
    sortOrder: { type: Number, default: 0, min: 0, max: 100000 },
    active: { type: Boolean, default: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentAccountSchema.index({ active: 1, archivedAt: 1, sortOrder: 1 });
const PaymentAccount =
  mongoose.models.PaymentAccount ||
  mongoose.model("PaymentAccount", paymentAccountSchema);

export default PaymentAccount;
