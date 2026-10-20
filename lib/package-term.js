import PortalSettings from "@/models/PortalSettings";
import PaymentVerification from "@/models/PaymentVerification";
import RegistrationPackage from "@/models/RegistrationPackage";
import User from "@/models/User";
import { getPackageExpiryDate } from "@/lib/package-dates";

export async function ensurePackageTerm(user, session) {
  if (!user || user.paymentStatus !== "approved") {
    return { active: false, expiresAt: user?.packageExpiresAt || null };
  }
  let packageQuery = RegistrationPackage.findById(user.packageId)
    .select("active archivedAt eligibleReferralTiers");
  if (session) packageQuery = packageQuery.session(session);
  const registrationPackage = await packageQuery.lean();
  if (
    !registrationPackage ||
    !registrationPackage.active ||
    registrationPackage.archivedAt ||
    (registrationPackage.eligibleReferralTiers?.length &&
      !registrationPackage.eligibleReferralTiers.includes(user.referralTier || "__unassigned__"))
  ) {
    return { active: false, expiresAt: user.packageExpiresAt || null };
  }

  let activatedAt = user.packageActivatedAt;
  let expiresAt = user.packageExpiresAt;
  if (!activatedAt || !expiresAt) {
    let query = PaymentVerification.findOne({ userId: user._id, status: "approved" })
      .sort({ approvedAt: -1, reviewedAt: -1 })
      .select("approvedAt reviewedAt packageValidityDays");
    if (session) query = query.session(session);
    const latestApproval = await query.lean();
    activatedAt = latestApproval?.approvedAt || latestApproval?.reviewedAt || null;
    if (!activatedAt) return { active: false, expiresAt: null };
    let policyQuery = PortalSettings.findOne({ key: "global" }).select("packagePolicy");
    if (session) policyQuery = policyQuery.session(session);
    const policy = await policyQuery.lean();
    const validityDays =
      latestApproval?.packageValidityDays || policy?.packagePolicy?.validityDays || 30;
    expiresAt = getPackageExpiryDate(activatedAt, validityDays);
    await User.updateOne(
      { _id: user._id, packageExpiresAt: null },
      { $set: { packageActivatedAt: activatedAt, packageExpiresAt: expiresAt } },
      session ? { session } : undefined,
    );
    user.packageActivatedAt = activatedAt;
    user.packageExpiresAt = expiresAt;
  }

  return {
    active: new Date(expiresAt).getTime() > Date.now(),
    expiresAt: new Date(expiresAt),
  };
}

export async function getRenewalEligibility(user, session) {
  let settingsQuery = PortalSettings.findOne({ key: "global" }).select("packagePolicy");
  let packageQuery = user?.packageId
    ? RegistrationPackage.findById(user.packageId).select("recommendedPackageId")
    : null;
  if (session) {
    settingsQuery = settingsQuery.session(session);
    if (packageQuery) packageQuery = packageQuery.session(session);
  }
  const [term, settings, currentPackage] = await Promise.all([
    ensurePackageTerm(user, session),
    settingsQuery.lean(),
    packageQuery ? packageQuery.lean() : null,
  ]);
  const now = Date.now();
  const cooldownMs = (settings?.packagePolicy?.renewalCooldownDays ?? 2) * 24 * 60 * 60 * 1000;
  const cooldownEndsAt = term.expiresAt ? new Date(term.expiresAt.getTime() + cooldownMs) : null;
  const cooldownActive = Boolean(
    !term.active &&
    settings?.packagePolicy?.requireRecommendedDuringCooldown !== false &&
    currentPackage?.recommendedPackageId &&
    cooldownEndsAt &&
    now < cooldownEndsAt.getTime(),
  );
  return {
    ...term,
    cooldownActive,
    cooldownEndsAt,
    recommendedPackageId: currentPackage?.recommendedPackageId?.toString() || "",
  };
}
