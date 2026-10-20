import mongoose from "mongoose";

const helpGuideSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    summary: { type: String, required: true, trim: true, maxlength: 400 },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HelpCenterCategory",
      required: true,
    },
    paragraphs: { type: [{ type: String, trim: true, maxlength: 4000 }], validate: (items) => items.length <= 30 },
    steps: { type: [{ type: String, trim: true, maxlength: 1000 }], validate: (items) => items.length <= 40 },
    images: {
      type: [{
        publicId: { type: String, required: true, maxlength: 300, match: /^ratewell\/help-center\/images\/[A-Za-z0-9_-]{12,80}$/ },
        alt: { type: String, required: true, trim: true, maxlength: 160 },
      }],
      validate: (items) => items.length <= 12,
    },
    videos: {
      type: [{
        provider: { type: String, enum: ["youtube", "vimeo"], required: true },
        videoId: { type: String, required: true, maxlength: 32, match: /^[A-Za-z0-9_-]{5,32}$/ },
      }],
      validate: (items) => items.length <= 8,
    },
    attachments: {
      type: [{
        publicId: { type: String, required: true, maxlength: 300, match: /^ratewell\/help-center\/files\/[A-Za-z0-9_-]{12,80}\.pdf$/ },
        filename: { type: String, required: true, trim: true, maxlength: 120 },
        sizeBytes: { type: Number, required: true, min: 1, max: 8 * 1024 * 1024 },
      }],
      validate: (items) => items.length <= 8,
    },
    visibility: { type: String, enum: ["public", "private"], default: "private", index: true },
    status: {
      type: String,
      enum: ["draft", "scheduled", "published", "archived"],
      default: "draft",
      index: true,
    },
    publishAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    featured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0, min: 0, max: 10000 },
    tags: { type: [{ type: String, trim: true, lowercase: true, maxlength: 32 }], validate: (items) => items.length <= 12 },
    relatedGuideIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "HelpGuide" }], validate: (items) => items.length <= 8 },
    updateNote: { type: String, trim: true, maxlength: 300, default: "" },
    views: { type: Number, default: 0, min: 0 },
    version: { type: Number, default: 1, min: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

helpGuideSchema.index({ slug: 1 }, { unique: true });
helpGuideSchema.index({ visibility: 1, status: 1, publishAt: 1, sortOrder: 1, publishedAt: -1 });
helpGuideSchema.index({ categoryId: 1, visibility: 1, status: 1, sortOrder: 1 });
helpGuideSchema.index({ featured: 1, visibility: 1, status: 1, publishedAt: -1 });

const HelpGuide = mongoose.models.HelpGuide || mongoose.model("HelpGuide", helpGuideSchema);

export default HelpGuide;
