export function getWalletBalanceSnapshot(balance, wallet, direction, amountMinor) {
  if (
    !balance ||
    !["earning", "deposit"].includes(wallet) ||
    !["credit", "debit"].includes(direction) ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 1
  ) {
    throw new TypeError("A valid wallet balance and transaction are required.");
  }

  const balanceAfterMinor = wallet === "deposit"
    ? balance.depositBalanceMinor
    : balance.balanceMinor;
  if (!Number.isSafeInteger(balanceAfterMinor) || balanceAfterMinor < 0) {
    throw new RangeError("Wallet balance must be a non-negative safe integer.");
  }

  const balanceBeforeMinor = direction === "credit"
    ? balanceAfterMinor - amountMinor
    : balanceAfterMinor + amountMinor;
  if (!Number.isSafeInteger(balanceBeforeMinor) || balanceBeforeMinor < 0) {
    throw new RangeError("Wallet transaction does not reconcile with its resulting balance.");
  }

  return { balanceBeforeMinor, balanceAfterMinor };
}
