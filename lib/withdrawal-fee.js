export function calculateWithdrawalFee(amountMinor, fixedMinor = 0, basisPoints = 0) {
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    !Number.isSafeInteger(fixedMinor) ||
    fixedMinor < 0 ||
    !Number.isInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10000
  ) {
    throw new RangeError("Withdrawal fee inputs must be non-negative integer minor units and valid basis points.");
  }
  return fixedMinor + Math.floor((amountMinor * basisPoints + 5000) / 10000);
}

export function isValidWithdrawalPolicy(minimumWithdrawalMinor, maximumWithdrawalMinor, feeBrackets) {
  if (
    !Number.isSafeInteger(minimumWithdrawalMinor) ||
    minimumWithdrawalMinor < 100 ||
    minimumWithdrawalMinor > 100000000 ||
    (maximumWithdrawalMinor !== null &&
      (!Number.isSafeInteger(maximumWithdrawalMinor) ||
        maximumWithdrawalMinor < minimumWithdrawalMinor ||
        maximumWithdrawalMinor > 100000000)) ||
    !Array.isArray(feeBrackets) ||
    feeBrackets.length === 0 ||
    feeBrackets.some((bracket) => !bracket || typeof bracket !== "object")
  ) {
    return false;
  }

  const sorted = [...feeBrackets].sort((left, right) =>
    left.minimumAmountMinor - right.minimumAmountMinor,
  );
  let nextMinimum = minimumWithdrawalMinor;

  for (let index = 0; index < sorted.length; index += 1) {
    const bracket = sorted[index];
    if (
      !bracket ||
      !Number.isSafeInteger(bracket.minimumAmountMinor) ||
      bracket.minimumAmountMinor !== nextMinimum ||
      (bracket.maximumAmountMinor !== null &&
        (!Number.isSafeInteger(bracket.maximumAmountMinor) ||
          bracket.maximumAmountMinor < bracket.minimumAmountMinor ||
          bracket.maximumAmountMinor > 100000000)) ||
      !Number.isInteger(bracket.basisPoints) ||
      bracket.basisPoints < 0 ||
      bracket.basisPoints >= 10000 ||
      Math.floor(
        (bracket.minimumAmountMinor * bracket.basisPoints + 5000) / 10000,
      ) >= bracket.minimumAmountMinor
    ) {
      return false;
    }

    if (bracket.maximumAmountMinor === null) {
      return maximumWithdrawalMinor === null && index === sorted.length - 1;
    }

    if (
      (maximumWithdrawalMinor !== null &&
        bracket.maximumAmountMinor > maximumWithdrawalMinor) ||
      bracket.maximumAmountMinor === 100000000 && maximumWithdrawalMinor === null
    ) {
      return false;
    }
    nextMinimum = bracket.maximumAmountMinor + 1;
  }

  return maximumWithdrawalMinor !== null &&
    sorted[sorted.length - 1].maximumAmountMinor === maximumWithdrawalMinor;
}

export function getWithdrawalFeeBasisPoints(amountMinor, feeBrackets) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !Array.isArray(feeBrackets)) {
    throw new RangeError("Withdrawal amount and fee brackets must be valid.");
  }
  const bracket = feeBrackets.find((item) =>
    amountMinor >= item.minimumAmountMinor &&
    (item.maximumAmountMinor === null || amountMinor <= item.maximumAmountMinor),
  );
  return bracket?.basisPoints ?? null;
}
