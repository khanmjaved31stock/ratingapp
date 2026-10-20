import mongoose from "mongoose";

export const ADMIN_GLOBAL_SEARCH_CATEGORIES = [
  { id: "withdrawals", label: "Withdrawals", target: "withdrawals" },
  { id: "registrationPayments", label: "Registration payments", target: "payment-approvals" },
  { id: "packageRequests", label: "Package renewals", target: "package-requests" },
  { id: "deposits", label: "Deposits", target: "deposit-approvals" },
  { id: "support", label: "Help-line / support", target: "support" },
  { id: "packages", label: "Packages", target: "packages", superAdminOnly: true },
];

export function buildAdminUserSearchFilter(search) {
  if (!search) return null;
  if (mongoose.isValidObjectId(search) && new mongoose.Types.ObjectId(search).toString() === search.toLowerCase()) {
    return { _id: new mongoose.Types.ObjectId(search) };
  }
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 100);
  const digits = search.replace(/\D/g, "");
  const conditions = [
    { name: { $regex: `^${escaped}`, $options: "i" } },
    { email: { $regex: `^${escaped}`, $options: "i" } },
  ];
  if (digits.length >= 3) {
    conditions.push({ whatsappPhone: { $regex: `^\\+?${digits}`, $options: "i" } });
  }
  return { $or: conditions };
}

export function buildGlobalSearchFilter(search) {
  if (mongoose.isValidObjectId(search) && new mongoose.Types.ObjectId(search).toString() === search.toLowerCase()) {
    return { _id: new mongoose.Types.ObjectId(search) };
  }
  return { $text: { $search: search } };
}

export function validateGlobalSearch(search) {
  return typeof search === "string" &&
    search.trim().length >= 2 &&
    search.trim().length <= 100 &&
    !search.split("").some((character) => character.charCodeAt(0) < 32);
}
