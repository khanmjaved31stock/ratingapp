import mongoose from "mongoose";

const adBannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    imageUrl: { type: String, required: true, maxlength: 2048 },
    imagePublicId: { type: String, required: true, maxlength: 300 },
    href: { type: String, trim: true, maxlength: 2048, default: "" },
    slot: {
      type: String,
      enum: ["header", "sidebar", "footer", "interstitial", "popup"],
      required: true,
    },
    active: { type: Boolean, default: false },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    impressions: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

adBannerSchema.index({ slot: 1, active: 1 });
const AdBanner = mongoose.models.AdBanner || mongoose.model("AdBanner", adBannerSchema);

export default AdBanner;
