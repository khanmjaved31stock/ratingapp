import mongoose from "mongoose";

const portalSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "global", unique: true },
    currency: { type: String, enum: ["PKR"], default: "PKR" },
    businessTimeZone: { type: String, trim: true, default: "UTC", maxlength: 100 },
    ratingRewardMinor: { type: Number, default: 0, min: 0, max: 1000000 },
    referralLevels: {
      type: [
        {
          level: { type: Number, min: 1, max: 10, required: true },
          basisPoints: { type: Number, min: 0, max: 10000, default: 0 },
        },
      ],
      default: () =>
        Array.from({ length: 5 }, (_, index) => ({
          level: index + 1,
          basisPoints: 0,
        })),
    },
    reviewTasks: {
      title: { type: String, trim: true, maxlength: 120, default: "Review task" },
      instructions: { type: String, trim: true, maxlength: 2000, default: "" },
      rulesText: { type: String, trim: true, maxlength: 4000, default: "" },
      websiteUrl: { type: String, trim: true, maxlength: 2048, default: "" },
      videoUrl: { type: String, trim: true, maxlength: 2048, default: "" },
      mediaImagePublicId: { type: String, trim: true, maxlength: 300, default: "" },
      rewardMinor: { type: Number, default: 0, min: 0, max: 1000000 },
      allowImage: { type: Boolean, default: false },
      requireImage: { type: Boolean, default: false },
      allowLink: { type: Boolean, default: false },
      requireLink: { type: Boolean, default: false },
      allowVideoLinks: { type: Boolean, default: false },
      minimumSeconds: { type: Number, default: 0, min: 0, max: 86400 },
      cooldownSeconds: { type: Number, default: 0, min: 0, max: 604800 },
      dailyLimit: { type: Number, default: 0, min: 0, max: 100 },
      userTotalLimit: { type: Number, default: 0, min: 0, max: 1000000 },
      totalLimit: { type: Number, default: 0, min: 0, max: 10000000 },
      packageIds: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: "RegistrationPackage" }],
        default: [],
        validate: (items) => items.length <= 100,
      },
    },
    referralMilestones: {
      type: [
        {
          id: { type: String, required: true, trim: true, maxlength: 40 },
          title: { type: String, required: true, trim: true, maxlength: 80 },
          directConversions: { type: Number, min: 0, max: 100000, required: true },
          indirectConversions: { type: Number, min: 0, max: 100000, default: 0 },
          windowSeconds: { type: Number, min: 0, max: 2592000, default: 0 },
          rewardMinor: { type: Number, min: 0, max: 100000000, default: 0 },
          tier: { type: String, trim: true, maxlength: 40, default: "" },
        },
      ],
      default: [],
      validate: (items) => items.length <= 50 && new Set(items.map((item) => item.id)).size === items.length,
    },
    branding: {
      userLogoPublicId: { type: String, default: "", maxlength: 300 },
      adminLogoPublicId: { type: String, default: "", maxlength: 300 },
    },
    goals: {
      monthlyRevenueMinor: { type: Number, default: 0, min: 0, max: 100000000000 },
      activeUsers: { type: Number, default: 0, min: 0, max: 100000000 },
      monthlyRatings: { type: Number, default: 0, min: 0, max: 100000000 },
      conversionPercent: { type: Number, default: 0, min: 0, max: 100 },
    },
    packagePolicy: {
      validityDays: { type: Number, default: 30, min: 1, max: 365 },
      renewalCooldownDays: { type: Number, default: 2, min: 0, max: 30 },
      requireRecommendedDuringCooldown: { type: Boolean, default: true },
    },
    legalContent: {
      termsVersion: { type: String, trim: true, maxlength: 40, default: "v1" },
      terms: {
        type: String,
        trim: true,
        maxlength: 20000,
        default: "Provide accurate account and payment information. Package access begins only after payment approval. Refund decisions follow the published refund policy and applicable law. Contact support if you have a payment question.",
      },
      privacy: {
        type: String,
        trim: true,
        maxlength: 20000,
        default: "Ratewell uses account, payment, task, and payout information to operate the service, protect accounts, verify payments, and process requested payouts. Sensitive payout details are encrypted at rest and shared with authorized staff only when needed to process a withdrawal.",
      },
      requireReacceptance: { type: Boolean, default: false },
    },
    marqueeNews: {
      message: { type: String, trim: true, maxlength: 500, default: "" },
      active: { type: Boolean, default: false },
      startsAt: { type: Date, default: null },
      endsAt: { type: Date, default: null },
    },
    reviewTaskCompletedCount: { type: Number, default: null, min: 0 },
    minimumWithdrawalMinor: { type: Number, default: 100, min: 100 },
    withdrawalFeeFixedMinor: { type: Number, default: 0, min: 0, max: 100000000 },
    withdrawalFeeBasisPoints: { type: Number, default: 0, min: 0, max: 10000 },
    withdrawalMethods: {
      type: [{
        _id: false,
        provider: {
          type: String,
          enum: ["easypaisa", "jazzcash", "bank", "usdtBep20", "usdtTrc20"],
          required: true,
        },
        displayName: { type: String, trim: true, required: true, maxlength: 80 },
        enabled: { type: Boolean, default: true, required: true },
        instructions: { type: String, trim: true, maxlength: 1000, default: "" },
      }],
      default: undefined,
      validate: (items) => items.length === 5 &&
        new Set(items.map((item) => item.provider)).size === 5,
    },
    maintenanceMode: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

const PortalSettings =
  mongoose.models.PortalSettings ||
  mongoose.model("PortalSettings", portalSettingsSchema);

export default PortalSettings;
