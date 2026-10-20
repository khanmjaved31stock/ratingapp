import AdminAuditLog from "@/models/AdminAuditLog";
import SecurityEvent from "@/models/SecurityEvent";
import { getRequestIp } from "@/lib/request-ip";

export async function writeAdminAudit(request, actor, action, target = {}) {
  const document = {
    actorId: actor.user._id,
    actorRole: actor.user.role,
    action,
    targetType: target.type || "",
    targetId: target.id || "",
    metadata: target.metadata || {},
    ipAddress: getRequestIp(request),
  };
  if (target.session) {
    await AdminAuditLog.create([document], { session: target.session });
  } else {
    await AdminAuditLog.create(document);
  }
}

export async function writeSecurityEvent(request, event, session) {
  const document = {
    ...event,
    ipAddress: getRequestIp(request),
    userAgent: request.headers.get("user-agent") || "",
  };
  if (session) {
    await SecurityEvent.create([document], { session });
  } else {
    await SecurityEvent.create(document);
  }
}
