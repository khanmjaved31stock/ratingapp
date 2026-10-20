import mongoose from "mongoose";

const adminRequestReadSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    category: {
      type: String,
      enum: ["registration", "payment", "package", "deposit", "withdrawal", "support"],
      required: true,
      immutable: true,
    },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    readAt: { type: Date, required: true, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

adminRequestReadSchema.index(
  { adminId: 1, category: 1, requestId: 1 },
  { unique: true },
);
adminRequestReadSchema.index({ adminId: 1, category: 1, readAt: -1 });

const AdminRequestRead =
  mongoose.models.AdminRequestRead ||
  mongoose.model("AdminRequestRead", adminRequestReadSchema);

export default AdminRequestRead;
