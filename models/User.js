import mongoose from "mongoose";

const packageWithdrawalFeeBracketSchema = new mongoose.Schema(
  {
    minimumAmountMinor: { type: Number, required: true, min: 100, max: 100000000 },
    maximumAmountMinor: { type: Number, default: null, min: 100, max: 100000000 },
    basisPoints: { type: Number, required: true, min: 0, max: 9999 },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    whatsappPhone: {
      type: String,
      trim: true,
      maxlength: 16,
      default: "",
      select: false,
    },
    emailVerified: { type: Boolean, default: true, required: true },
    emailVerifiedAt: { type: Date, default: null },
    termsAcceptedAt: { type: Date, default: null },
    termsVersion: { type: String, trim: true, maxlength: 40, default: "" },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "superAdmin", "helpAdmin", "moderator"],
      default: "user",
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
      required: true,
    },
    suspended: {
      type: Boolean,
      default: false,
      required: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    paymentStatus: {
      type: String,
      enum: ["notRequired", "pending", "approved", "rejected"],
      default: "notRequired",
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RegistrationPackage",
      default: null,
    },
    packagePriceMinor: {
      type: Number,
      min: 0,
      default: 0,
    },
    packageCurrency: {
      type: String,
      enum: ["PKR"],
      default: "PKR",
    },
    packageName: { type: String, trim: true, maxlength: 100, default: "" },
    packageDescription: { type: String, trim: true, maxlength: 500, default: "" },
    packageBenefits: {
      type: [{ type: String, trim: true, maxlength: 200 }],
      default: [],
      validate: (items) => items.length <= 20,
    },
    packageValidityDays: { type: Number, default: null, min: 1, max: 365 },
    packageActivatedAt: { type: Date, default: null },
    packageExpiresAt: { type: Date, default: null },
    packageDailyEarningLimitMinor: { type: Number, default: 0, min: 0, max: 100000000 },
    packageDailyTaskQuota: { type: Number, default: 0, min: 0, max: 1000 },
    packageDailyTaskLimit: { type: Number, default: null, min: 0, max: 1000 },
    packagePerTaskEarningsMinor: { type: Number, default: 0, min: 0, max: 1000000 },
    packageWithdrawalMinimumMinor: { type: Number, default: 100, min: 100, max: 100000000 },
    packageWithdrawalMaximumMinor: { type: Number, default: null, min: 100, max: 100000000 },
    packageWithdrawalFeeBrackets: {
      type: [packageWithdrawalFeeBracketSchema],
      default: () => [{ minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 }],
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    profileAvatar: {
      type: String,
      default: "",
      maxlength: 2048,
    },
    profileAvatarPublicId: {
      type: String,
      default: "",
      maxlength: 300,
      select: false,
    },
    preferences: {
      notifications: { type: Boolean, default: true },
      publicProfile: { type: Boolean, default: false },
      theme: { type: String, enum: ["light", "dark"], default: "light" },
    },
    payoutProfile: {
      provider: {
        type: String,
        enum: ["easypaisa", "jazzcash", "bank", "usdtBep20", "usdtTrc20", ""],
        default: "",
      },
      encryptedDetails: {
        type: String,
        default: "",
        select: false,
      },
      updatedAt: { type: Date, default: null },
    },
    sessionVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    referredUserCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastReviewAt: { type: Date, default: null },
    reviewTaskStartedAt: { type: Date, default: null, select: false },
    reviewDailyCount: { type: Number, default: 0, min: 0 },
    reviewDailyDate: { type: String, default: "" },
    reviewTaskTotalCount: { type: Number, default: 0, min: 0 },
    referralDirectConversions: { type: Number, default: 0, min: 0 },
    referralIndirectConversions: { type: Number, default: 0, min: 0 },
    unlockedReferralMilestones: {
      type: [{ type: String, trim: true, maxlength: 40 }],
      default: [],
    },
    referralTier: { type: String, default: "", maxlength: 40 },
  },
  { timestamps: true },
);

userSchema.index({ whatsappPhone: 1 });
userSchema.index({ name: 1 });
const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
