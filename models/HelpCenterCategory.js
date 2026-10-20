import mongoose from "mongoose";

const helpCenterCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 90 },
    sortOrder: { type: Number, default: 0, min: 0, max: 10000 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

helpCenterCategorySchema.index({ slug: 1 }, { unique: true });
helpCenterCategorySchema.index({ active: 1, sortOrder: 1, name: 1 });

const HelpCenterCategory =
  mongoose.models.HelpCenterCategory ||
  mongoose.model("HelpCenterCategory", helpCenterCategorySchema);

export default HelpCenterCategory;
