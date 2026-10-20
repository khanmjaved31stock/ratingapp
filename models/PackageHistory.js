import mongoose from "mongoose";

const withdrawalFeeBracketSchema = new mongoose.Schema(
  {
    minimumAmountMinor: { type: Number, required: true, min: 100, max: 100000000, immutable: true },
    maximumAmountMinor: { type: Number, default: null, min: 100, max: 100000000, immutable: true },
    basisPoints: { type: Number, required: true, min: 0, max: 9999, immutable: true },
  },
  { _id: false },
);

const packageHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: "RegistrationPackage", required: true, immutable: true },
    event: { type: String, enum: ["activated", "renewed", "assigned", "extended"], required: true, immutable: true },
    sourceType: {
      type: String,
      enum: ["paymentVerification", "walletPurchase", "adminAssignment", "adminExtension"],
      required: true,
      immutable: true,
    },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
    amountMinor: { type: Number, required: true, min: 0, immutable: true },
    currency: { type: String, enum: ["PKR"], default: "PKR", immutable: true },
    packageSnapshot: {
      name: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
      description: { type: String, trim: true, maxlength: 500, default: "", immutable: true },
      validityDays: { type: Number, required: true, min: 1, max: 365, immutable: true },
      dailyTaskLimit: { type: Number, required: true, min: 0, max: 1000, immutable: true },
      dailyEarningLimitMinor: { type: Number, required: true, min: 0, immutable: true },
      perTaskEarningsMinor: { type: Number, required: true, min: 0, immutable: true },
      minimumWithdrawalMinor: { type: Number, required: true, min: 100, max: 100000000, immutable: true },
      maximumWithdrawalMinor: { type: Number, default: null, min: 100, max: 100000000, immutable: true },
      withdrawalFeeBrackets: {
        type: [withdrawalFeeBracketSchema],
        default: () => [{ minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 }],
        immutable: true,
      },
      benefits: {
        type: [{ type: String, trim: true, maxlength: 200 }],
        default: [],
        immutable: true,
        validate: (items) => items.length <= 20,
      },
    },
    previousPackageId: { type: mongoose.Schema.Types.ObjectId, ref: "RegistrationPackage", default: null, immutable: true },
    previousPackageName: { type: String, trim: true, maxlength: 100, default: "", immutable: true },
    previousPriceMinor: { type: Number, min: 0, default: 0, immutable: true },
    previousActivatedAt: { type: Date, default: null, immutable: true },
    previousExpiresAt: { type: Date, default: null, immutable: true },
    activatedAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true },
    extendedDays: { type: Number, min: 0, max: 365, default: 0, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

packageHistorySchema.index({ userId: 1, createdAt: -1 });
packageHistorySchema.index({ sourceType: 1, sourceId: 1 }, { unique: true });
packageHistorySchema.index({ packageId: 1, createdAt: -1 });

const PackageHistory =
  mongoose.models.PackageHistory ||
  mongoose.model("PackageHistory", packageHistorySchema);

export default PackageHistory;
