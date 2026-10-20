import PackageHistory from "@/models/PackageHistory";

export async function recordPackageHistory({
  user,
  packageSnapshot,
  event,
  sourceType,
  sourceId,
  actorId = null,
  amountMinor,
  activatedAt,
  expiresAt,
  extendedDays = 0,
  session,
}) {
  const record = {
    userId: user._id,
    packageId: packageSnapshot._id || packageSnapshot.packageId,
    event,
    sourceType,
    sourceId,
    actorId,
    amountMinor,
    currency: packageSnapshot.currency || "PKR",
    packageSnapshot: {
      name: packageSnapshot.name || user.packageName || "Registration package",
      description: packageSnapshot.description || "",
      validityDays: packageSnapshot.validityDays || user.packageValidityDays || 30,
      dailyTaskLimit: packageSnapshot.dailyTaskLimit ?? packageSnapshot.dailyTaskQuota ?? user.packageDailyTaskLimit ?? user.packageDailyTaskQuota ?? 0,
      dailyEarningLimitMinor: packageSnapshot.dailyEarningLimitMinor ?? user.packageDailyEarningLimitMinor ?? 0,
      perTaskEarningsMinor: packageSnapshot.perTaskEarningsMinor ?? user.packagePerTaskEarningsMinor ?? 0,
      minimumWithdrawalMinor: packageSnapshot.minimumWithdrawalMinor ?? user.packageWithdrawalMinimumMinor ?? 100,
      maximumWithdrawalMinor: packageSnapshot.maximumWithdrawalMinor ?? user.packageWithdrawalMaximumMinor ?? null,
      withdrawalFeeBrackets: packageSnapshot.withdrawalFeeBrackets ?? user.packageWithdrawalFeeBrackets ?? [
        { minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 },
      ],
      benefits: packageSnapshot.benefits || [],
    },
    previousPackageId: user.packageId || null,
    previousPackageName: user.packageName || "",
    previousPriceMinor: user.packagePriceMinor || 0,
    previousActivatedAt: user.packageActivatedAt || null,
    previousExpiresAt: user.packageExpiresAt || null,
    activatedAt,
    expiresAt,
    extendedDays,
  };
  const [history] = await PackageHistory.create([record], session ? { session } : undefined);
  return history;
}
