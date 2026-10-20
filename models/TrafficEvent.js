import mongoose from "mongoose";

const trafficEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["pageView", "registration", "rating"], required: true },
    path: { type: String, trim: true, maxlength: 240, default: "" },
    visitorHash: { type: String, trim: true, maxlength: 128, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

trafficEventSchema.index({ createdAt: -1, type: 1 });
const TrafficEvent =
  mongoose.models.TrafficEvent ||
  mongoose.model("TrafficEvent", trafficEventSchema);

export default TrafficEvent;
