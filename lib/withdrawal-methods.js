export const DEFAULT_WITHDRAWAL_METHODS = [
  { provider: "easypaisa", displayName: "Easypaisa", enabled: true, instructions: "" },
  { provider: "jazzcash", displayName: "JazzCash", enabled: true, instructions: "" },
  { provider: "bank", displayName: "Bank transfer", enabled: true, instructions: "" },
  { provider: "usdtBep20", displayName: "USDT · BEP20", enabled: true, instructions: "" },
  { provider: "usdtTrc20", displayName: "USDT · TRC20", enabled: true, instructions: "" },
];

export function normalizeWithdrawalMethods(methods) {
  if (!Array.isArray(methods) || methods.length !== DEFAULT_WITHDRAWAL_METHODS.length) return null;
  const allowed = new Set(DEFAULT_WITHDRAWAL_METHODS.map((item) => item.provider));
  const seen = new Set();
  const normalized = [];

  for (const method of methods) {
    if (
      !method ||
      typeof method.provider !== "string" ||
      !allowed.has(method.provider) ||
      seen.has(method.provider) ||
      typeof method.enabled !== "boolean" ||
      typeof method.displayName !== "string" ||
      typeof method.instructions !== "string"
    ) return null;
    const displayName = method.displayName.trim();
    const instructions = method.instructions.trim();
    if (!displayName || displayName.length > 80 || instructions.length > 1000) return null;
    seen.add(method.provider);
    normalized.push({ provider: method.provider, displayName, enabled: method.enabled, instructions });
  }

  return seen.size === allowed.size ? normalized : null;
}

export function getConfiguredWithdrawalMethods(methods) {
  if (methods === undefined || methods === null) {
    return DEFAULT_WITHDRAWAL_METHODS.map((method) => ({ ...method }));
  }
  const configuredByProvider = new Map(
    Array.isArray(methods)
      ? methods.filter((method) => method && typeof method.provider === "string")
        .map((method) => [method.provider, method])
      : [],
  );
  return DEFAULT_WITHDRAWAL_METHODS.map((fallback) => {
    const configured = configuredByProvider.get(fallback.provider);
    if (!configured) return { ...fallback, enabled: false };
    return {
      provider: fallback.provider,
      displayName: typeof configured.displayName === "string" && configured.displayName.trim()
        ? configured.displayName.trim().slice(0, 80)
        : fallback.displayName,
      enabled: configured.enabled === true,
      instructions: typeof configured.instructions === "string"
        ? configured.instructions.trim().slice(0, 1000)
        : "",
    };
  });
}

export function getWithdrawalStatusFilter(decision) {
  if (decision === "processing") return ["pending"];
  if (decision === "paid" || decision === "rejected") return ["pending", "processing"];
  return null;
}
