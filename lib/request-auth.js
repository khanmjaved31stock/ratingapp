import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import ActiveSession from "@/models/ActiveSession";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import BlockedIp from "@/models/BlockedIp";
import { getRequestIp } from "@/lib/request-ip";
import { isMaintenanceMode } from "@/lib/maintenance";
import { isEmailVerified } from "@/lib/email-verification";

export async function getActiveRequestUser(
  request,
  { allowPendingPayment = false } = {},
) {
  const session = await readSessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!session) return null;

  await connectDB();
  const ipAddress = getRequestIp(request);
  if (
    ipAddress &&
    (await BlockedIp.exists({
      address: ipAddress,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    }))
  ) {
    return null;
  }
  const user = await User.findById(session.id).select(
    "name email role active suspended emailVerified deletedAt sessionVersion paymentStatus packageId packageActivatedAt packageExpiresAt preferences lastReviewAt referralCode termsAcceptedAt termsVersion",
  );
  if (
    !user ||
    user.suspended ||
    (user.role === "user" && !isEmailVerified(user)) ||
    (!user.active &&
      !(allowPendingPayment && user.role === "user" && user.paymentStatus === "pending")) ||
    user.deletedAt ||
    user.role !== session.role ||
    user.sessionVersion !== session.version
  ) {
    return null;
  }
  if (user.role === "user" && (await isMaintenanceMode())) return null;

  const activeSession = await ActiveSession.findOne({
    jti: session.jti,
    userId: user._id,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).select("_id");
  if (!activeSession) return null;

  await ActiveSession.updateOne(
    { _id: activeSession._id },
    { $set: { lastSeenAt: new Date() } },
  );

  return { session, user };
}
