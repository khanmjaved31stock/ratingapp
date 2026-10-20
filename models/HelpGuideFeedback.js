import mongoose from "mongoose";

const helpGuideFeedbackSchema = new mongoose.Schema(
  {
    guideId: { type: mongoose.Schema.Types.ObjectId, ref: "HelpGuide", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    kind: { type: String, enum: ["helpful", "issue"], required: true, index: true },
    helpful: { type: Boolean, default: null },
    message: { type: String, trim: true, maxlength: 2000, default: "" },
    status: { type: String, enum: ["open", "reviewing", "resolved"], default: "open", index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

helpGuideFeedbackSchema.index(
  { guideId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { kind: "helpful", userId: { $type: "objectId" } } },
);
helpGuideFeedbackSchema.index({ kind: 1, status: 1, createdAt: -1 });

const HelpGuideFeedback =
  mongoose.models.HelpGuideFeedback ||
  mongoose.model("HelpGuideFeedback", helpGuideFeedbackSchema);

export default HelpGuideFeedback;
