import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true,
    },
    type: {
      type: String,
      enum: [
        "packagePayment",
        "ratingReward",
        "referralCommission",
        "referralMilestone",
        "withdrawal",
        "adjustment",
        "payout",
        "depositCredit",
        "packagePurchase",
      ],
      required: true,
      immutable: true,
    },
    wallet: { type: String, enum: ["earning", "deposit"], default: "earning", required: true, immutable: true },
    direction: { type: String, enum: ["credit", "debit"], required: true, immutable: true },
    amountMinor: { type: Number, required: true, min: 1, immutable: true },
    currency: { type: String, enum: ["PKR"], default: "PKR", immutable: true },
    businessDate: {
      type: String,
      maxlength: 10,
      default: "",
      immutable: true,
      match: /^(?:\d{4}-\d{2}-\d{2})?$/,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "rejected"],
      default: "completed",
      immutable: true,
    },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
    reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: "WalletTransaction", default: null, immutable: true },
    idempotencyKey: { type: String, unique: true, sparse: true, maxlength: 200, immutable: true },
    balanceBeforeMinor: { type: Number, min: 0, max: Number.MAX_SAFE_INTEGER, default: null, immutable: true },
    balanceAfterMinor: { type: Number, min: 0, max: Number.MAX_SAFE_INTEGER, default: null, immutable: true },
    description: { type: String, trim: true, maxlength: 240, required: true, immutable: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

walletTransactionSchema.index({ userId: 1, _id: -1 });
walletTransactionSchema.index({ type: 1, status: 1, createdAt: -1 });
walletTransactionSchema.index({ userId: 1, type: 1, status: 1, businessDate: 1 });

const WalletTransaction =
  mongoose.models.WalletTransaction ||
  mongoose.model("WalletTransaction", walletTransactionSchema);

export default WalletTransaction;
