import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import connectDB from "@/lib/mongodb";
import ActiveSession from "@/models/ActiveSession";
import User from "@/models/User";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { isMaintenanceMode } from "@/lib/maintenance";
import { ensurePackageTerm } from "@/lib/package-term";
import { isEmailVerified } from "@/lib/email-verification";

export async function requirePendingPaymentUser() {
  const cookieStore = await cookies();
  const session = await readSessionToken(
    cookieStore.get(SESSION_COOKIE)?.value,
  );
  if (!session || session.role !== "user") redirect("/");

  await connectDB();
  const user = await User.findById(session.id).select(
    "role active suspended emailVerified deletedAt paymentStatus sessionVersion packageActivatedAt packageExpiresAt",
  );
  if (
    !user ||
    user.suspended ||
    !isEmailVerified(user) ||
    user.role !== "user" ||
    user.deletedAt ||
    user.sessionVersion !== session.version
  ) {
    redirect("/");
  }
  if (user.paymentStatus === "notRequired") {
    redirect("/dashboard");
  }
  if (user.paymentStatus === "approved") {
    const term = await ensurePackageTerm(user);
    if (term.active) redirect("/dashboard");
    if (!user.active) redirect("/");
  } else if (user.paymentStatus !== "pending" || user.active) {
    redirect("/");
  }

  const activeSession = await ActiveSession.exists({
    jti: session.jti,
    userId: user._id,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!activeSession) redirect("/");
  if (await isMaintenanceMode()) redirect("/maintenance");
  return { id: user._id.toString() };
}
