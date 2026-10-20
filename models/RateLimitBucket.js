import mongoose from "mongoose";

const rateLimitBucketSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: false },
);

const RateLimitBucket =
  mongoose.models.RateLimitBucket ||
  mongoose.model("RateLimitBucket", rateLimitBucketSchema);

export default RateLimitBucket;
