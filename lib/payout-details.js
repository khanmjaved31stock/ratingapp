export const payoutProviders = [
  "easypaisa",
  "jazzcash",
  "bank",
  "usdtBep20",
  "usdtTrc20",
];

function maskValue(value) {
  if (typeof value !== "string" || !value) return "";
  if (value.length <= 4) return "•".repeat(value.length);
  return `${"•".repeat(4)}${value.slice(-4)}`;
}

function maskName(value) {
  if (typeof value !== "string" || !value) return "";
  const first = value.trim().slice(0, 1);
  return first ? `${first}${"•".repeat(3)}` : "";
}

export function maskPayoutDetails(details = {}) {
  return {
    accountTitle: maskName(details.accountTitle),
    accountNumber: maskValue(details.accountNumber),
    iban: maskValue(details.iban),
    bankName: details.bankName || "",
    walletAddress: maskValue(details.walletAddress),
  };
}

function validIban(value) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false;
  const rearranged = `${value.slice(4)}${value.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearranged) {
    const digits = character >= "A" ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function normalizePayoutDetails(input) {
  const provider = input.provider;
  const accountTitle =
    typeof input.accountTitle === "string" ? input.accountTitle.trim().replace(/\s+/g, " ") : "";
  const bankName =
    typeof input.bankName === "string" ? input.bankName.trim().replace(/\s+/g, " ") : "";
  const accountNumber =
    typeof input.accountNumber === "string"
      ? input.accountNumber.trim().replace(/[\s-]/g, "")
      : "";
  const iban =
    typeof input.iban === "string"
      ? input.iban.trim().replace(/\s/g, "").toUpperCase()
      : "";
  const walletAddress =
    typeof input.walletAddress === "string" ? input.walletAddress.trim() : "";
  const isCrypto = provider === "usdtBep20" || provider === "usdtTrc20";

  if (
    !payoutProviders.includes(provider) ||
    !accountTitle ||
    accountTitle.length > 120 ||
    bankName.length > 100 ||
    accountNumber.length > 64 ||
    iban.length > 34 ||
    (provider === "bank" && !bankName) ||
    (provider === "bank" && !accountNumber && !iban) ||
    (provider === "bank" && iban && !validIban(iban)) ||
    (provider === "easypaisa" && !/^\+?\d{7,15}$/.test(accountNumber)) ||
    (provider === "jazzcash" && !/^\+?\d{7,15}$/.test(accountNumber)) ||
    (isCrypto &&
      (!walletAddress ||
        walletAddress.length > 128 ||
        (provider === "usdtBep20" && !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) ||
        (provider === "usdtTrc20" && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(walletAddress)))) ||
    (!isCrypto && walletAddress)
  ) {
    return null;
  }

  return { provider, accountTitle, accountNumber, iban, bankName, walletAddress };
}
