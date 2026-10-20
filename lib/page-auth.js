import { redirect } from "next/navigation";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getSession } from "@/lib/auth";
import { isMaintenanceMode } from "@/lib/maintenance";
import { headers } from "next/headers";
import BlockedIp from "@/models/BlockedIp";
import { getRequestIp } from "@/lib/request-ip";
import { ensurePackageTerm } from "@/lib/package-term";
import { isEmailVerified } from "@/lib/email-verification";

export async function requirePageRole(role, loginPath) {
  const session = await getSession();
  if (!session || session.role !== role) redirect(loginPath);

  await connectDB();
  const ipAddress = getRequestIp({ headers: await headers() });
  if (
    ipAddress &&
    (await BlockedIp.exists({
      address: ipAddress,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    }))
  ) {
    redirect(loginPath);
  }
  const user = await User.findById(session.id).select(
    "name email role active suspended emailVerified deletedAt paymentStatus sessionVersion packageId packageName packagePriceMinor packageCurrency packageValidityDays packageDailyTaskLimit packageDailyTaskQuota packagePerTaskEarningsMinor packageActivatedAt packageExpiresAt referralTier",
  );
  if (
    !user ||
    user.suspended ||
    (role === "user" && !isEmailVerified(user)) ||
    !user.active ||
    user.deletedAt ||
    user.role !== role ||
    user.sessionVersion !== session.version ||
    (role === "user" &&
      user.paymentStatus !== "approved" &&
      user.paymentStatus !== "notRequired")
  ) {
    if (
      role === "user" &&
      user?.paymentStatus === "pending" &&
      user.active === false &&
      !user.suspended &&
      isEmailVerified(user) &&
      !user.deletedAt &&
      user.sessionVersion === session.version
    ) {
      redirect("/dashboard/payment");
    }
    redirect(loginPath);
  }
  if (role === "user" && (await isMaintenanceMode())) redirect("/maintenance");
  const packageTerm = role === "user" ? await ensurePackageTerm(user) : null;

  return {
    ...session,
    name: user.name,
    email: user.email,
    role: user.role,
    packageActivatedAt: user.packageActivatedAt,
    packageExpiresAt: packageTerm?.expiresAt || user.packageExpiresAt || null,
    packageName: user.packageName || "",
    packagePriceMinor: user.packagePriceMinor || 0,
    packageCurrency: user.packageCurrency || "PKR",
    packageDailyTaskLimit: user.packageDailyTaskLimit ?? user.packageDailyTaskQuota ?? 0,
    packagePerTaskEarningsMinor: user.packagePerTaskEarningsMinor || 0,
    referralTier: user.referralTier || "",
  };
}
