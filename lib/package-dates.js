export function getPackageExpiryDate(activatedAt, validityDays) {
  const activatedAtDate = activatedAt instanceof Date ? activatedAt : new Date(activatedAt);
  if (
    !Number.isFinite(activatedAtDate.getTime()) ||
    !Number.isInteger(validityDays) ||
    validityDays < 1 ||
    validityDays > 365
  ) {
    throw new RangeError("Package activation date and validity period are invalid.");
  }
  return new Date(activatedAtDate.getTime() + validityDays * 24 * 60 * 60 * 1000);
}

export function getRemainingPackageDays(expiresAt, now = Date.now()) {
  const expiryTime = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryTime) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.ceil((expiryTime - now) / (24 * 60 * 60 * 1000)));
}
