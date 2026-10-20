import mongoose from "mongoose";

const walletBalanceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balanceMinor: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER },
    depositBalanceMinor: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER },
    currency: { type: String, enum: ["PKR"], default: "PKR" },
  },
  { timestamps: true },
);

const WalletBalance =
  mongoose.models.WalletBalance ||
  mongoose.model("WalletBalance", walletBalanceSchema);

export default WalletBalance;
