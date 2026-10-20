import mongoose from "mongoose";

const withdrawalFeeBracketSchema = new mongoose.Schema(
  {
    minimumAmountMinor: { type: Number, required: true, min: 100, max: 100000000 },
    maximumAmountMinor: { type: Number, default: null, min: 100, max: 100000000 },
    basisPoints: { type: Number, required: true, min: 0, max: 9999 },
  },
  { _id: false },
);

const registrationPackageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    priceMinor: { type: Number, required: true, min: 0, max: 100000000 },
    validityDays: { type: Number, default: 30, min: 1, max: 365 },
    dailyEarningLimitMinor: { type: Number, default: 0, min: 0, max: 100000000 },
    dailyTaskQuota: { type: Number, default: 0, min: 0, max: 1000 },
    dailyTaskLimit: { type: Number, default: null, min: 0, max: 1000 },
    perTaskEarningsMinor: { type: Number, default: 0, min: 0, max: 1000000 },
    minimumWithdrawalMinor: { type: Number, default: 100, min: 100, max: 100000000 },
    maximumWithdrawalMinor: { type: Number, default: null, min: 100, max: 100000000 },
    withdrawalFeeBrackets: {
      type: [withdrawalFeeBracketSchema],
      default: () => [{ minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 }],
    },
    currency: { type: String, default: "PKR", enum: ["PKR"], required: true },
    benefits: {
      type: [{ type: String, trim: true, maxlength: 200 }],
      default: [],
      validate: (items) => items.length <= 20,
    },
    active: { type: Boolean, default: true },
    archivedAt: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 },
    recommendedPackageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RegistrationPackage",
      default: null,
    },
    eligibleReferralTiers: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],
      default: [],
      validate: (items) => items.length <= 20 && new Set(items).size === items.length,
    },
  },
  { timestamps: true },
);

registrationPackageSchema.index({ active: 1, sortOrder: 1 });
registrationPackageSchema.index({
  name: "text",
  description: "text",
  benefits: "text",
});
const RegistrationPackage =
  mongoose.models.RegistrationPackage ||
  mongoose.model("RegistrationPackage", registrationPackageSchema);

export default RegistrationPackage;
