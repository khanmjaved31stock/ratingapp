export function normalizeWhatsAppPhone(value) {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input || input.length > 32 || !/^\+?[\d\s().-]+$/.test(input)) return null;
  let digits = input.replace(/\D/g, "");
  if (input.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return `+${digits}`;
}
