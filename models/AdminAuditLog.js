import mongoose from "mongoose";

const adminAuditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    actorRole: {
      type: String,
      enum: ["superAdmin", "helpAdmin", "moderator"],
      required: true,
      immutable: true,
    },
    action: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
    targetType: { type: String, trim: true, maxlength: 80, default: "", immutable: true },
    targetId: { type: String, trim: true, maxlength: 120, default: "", immutable: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true },
    ipAddress: { type: String, trim: true, maxlength: 64, default: "", immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ actorId: 1, createdAt: -1 });
adminAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
const AdminAuditLog =
  mongoose.models.AdminAuditLog ||
  mongoose.model("AdminAuditLog", adminAuditLogSchema);

export default AdminAuditLog;
