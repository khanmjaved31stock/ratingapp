import mongoose from "mongoose";

const helpGuideVersionSchema = new mongoose.Schema(
  {
    guideId: { type: mongoose.Schema.Types.ObjectId, ref: "HelpGuide", required: true, immutable: true },
    version: { type: Number, required: true, min: 1, immutable: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    updateNote: { type: String, trim: true, maxlength: 300, default: "", immutable: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    actorRole: { type: String, enum: ["superAdmin"], required: true, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

helpGuideVersionSchema.index({ guideId: 1, version: -1 }, { unique: true });

const HelpGuideVersion =
  mongoose.models.HelpGuideVersion ||
  mongoose.model("HelpGuideVersion", helpGuideVersionSchema);

export default HelpGuideVersion;
