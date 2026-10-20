import PortalSettings from "@/models/PortalSettings";
import { requiresTermsAcceptance } from "./terms-policy.js";
export { requiresTermsAcceptance } from "./terms-policy.js";

export const DEFAULT_TERMS_VERSION = "v1";
export const DEFAULT_TERMS =
  "Provide accurate account and payment information. Package access begins only after payment approval. Refund decisions follow the published refund policy and applicable law. Contact support if you have a payment question.";
export const DEFAULT_PRIVACY =
  "Ratewell uses account, payment, task, and payout information to operate the service, protect accounts, verify payments, and process requested payouts. Sensitive payout details are encrypted at rest and shared with authorized staff only when needed to process a withdrawal.";

export async function requiresCurrentTermsAcceptance(user) {
  if (user?.role !== "user") return false;
  const settings = await PortalSettings.findOne({ key: "global" })
    .select("legalContent")
    .lean();
  return requiresTermsAcceptance(user, settings?.legalContent);
}

export function currentTermsRequiredMessage() {
  return "Review and accept the current Terms & Conditions before continuing.";
}
