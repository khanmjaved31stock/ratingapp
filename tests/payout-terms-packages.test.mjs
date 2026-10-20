import test from "node:test";
import assert from "node:assert/strict";
import RegistrationPackage from "../models/RegistrationPackage.js";
import User from "../models/User.js";
import PaymentVerification from "../models/PaymentVerification.js";
import PackageHistory from "../models/PackageHistory.js";
import DepositRequest from "../models/DepositRequest.js";
import SupportTicket from "../models/SupportTicket.js";
import PortalSettings from "../models/PortalSettings.js";
import WithdrawalRequest from "../models/WithdrawalRequest.js";
import {
  calculateWithdrawalFee,
  getWithdrawalFeeBasisPoints,
  isValidWithdrawalPolicy,
} from "../lib/withdrawal-fee.js";
import { maskPayoutDetails, normalizePayoutDetails } from "../lib/payout-details.js";
import { requiresTermsAcceptance } from "../lib/terms-policy.js";
import { getPreviousActiveAssignmentFilter } from "../lib/review-task-assignments.js";
import {
  DEFAULT_WITHDRAWAL_METHODS,
  getConfiguredWithdrawalMethods,
  getWithdrawalStatusFilter,
  normalizeWithdrawalMethods,
} from "../lib/withdrawal-methods.js";
import { getMongoUri } from "../lib/mongo-uri.js";
import AdminRequestRead from "../models/AdminRequestRead.js";
import {
  ADMIN_REQUEST_CATEGORIES,
  getUnreadCount,
  isDuplicateOnlyBulkWriteError,
} from "../lib/admin-request-notifications.js";
import { normalizeWhatsAppPhone } from "../lib/whatsapp-phone.js";
import { escapeCsvCell, formatContactCsvRow } from "../lib/contact-export.js";
import {
  ADMIN_GLOBAL_SEARCH_CATEGORIES,
  buildAdminUserSearchFilter,
  buildGlobalSearchFilter,
  validateGlobalSearch,
} from "../lib/admin-search.js";

test("payout values normalize safely and ordinary views mask account identifiers", () => {
  const normalized = normalizePayoutDetails({
    provider: "easypaisa",
    accountTitle: "  A   Person ",
    accountNumber: "+92 300-1234567",
  });
  assert.deepEqual(normalized, {
    provider: "easypaisa",
    accountTitle: "A Person",
    accountNumber: "+923001234567",
    iban: "",
    bankName: "",
    walletAddress: "",
  });
  assert.equal(normalizePayoutDetails({
    provider: "bank",
    accountTitle: "Account Holder",
    accountNumber: "",
    iban: "GB82 WEST 1234 5698 7654 32",
    bankName: "Example Bank",
  }).iban, "GB82WEST12345698765432");
  assert.equal(normalizePayoutDetails({
    provider: "bank",
    accountTitle: "Account Holder",
    accountNumber: "",
    iban: "GB00WEST12345698765432",
    bankName: "Example Bank",
  }), null);
  assert.deepEqual(maskPayoutDetails({
    accountTitle: "Account Holder",
    accountNumber: "123456789",
    iban: "GB82WEST12345698765432",
    walletAddress: "T1234567890123456789012345678901234",
  }), {
    accountTitle: "A•••",
    accountNumber: "••••6789",
    iban: "••••5432",
    bankName: "",
    walletAddress: "••••1234",
  });
});

test("terms reacceptance is version-based and registration records acceptance", () => {
  assert.equal(requiresTermsAcceptance(
    { role: "user", termsVersion: "v1" },
    { termsVersion: "v2", requireReacceptance: true },
  ), true);
  assert.equal(requiresTermsAcceptance(
    { role: "user", termsVersion: "v1" },
    { termsVersion: "v2", requireReacceptance: false },
  ), false);
  assert.ok(User.schema.path("termsAcceptedAt"));
  assert.ok(User.schema.path("termsVersion"));
});

test("package schemas allow ten or more separately configured packages", () => {
  const packages = Array.from({ length: 12 }, (_, index) => new RegistrationPackage({
    name: `Tier ${index + 1}`,
    priceMinor: (index + 1) * 100,
    dailyTaskLimit: index + 10,
  }));
  assert.equal(packages.length, 12);
  assert.ok(packages.every((item) => !item.validateSync()));
});

test("package withdrawal fee brackets cover inclusive limits without gaps or overlaps", () => {
  const brackets = [
    { minimumAmountMinor: 100, maximumAmountMinor: 499, basisPoints: 250 },
    { minimumAmountMinor: 500, maximumAmountMinor: null, basisPoints: 500 },
  ];
  assert.equal(isValidWithdrawalPolicy(100, null, brackets), true);
  assert.equal(getWithdrawalFeeBasisPoints(100, brackets), 250);
  assert.equal(getWithdrawalFeeBasisPoints(499, brackets), 250);
  assert.equal(getWithdrawalFeeBasisPoints(500, brackets), 500);
  assert.equal(calculateWithdrawalFee(10000, 0, 500), 500);
  assert.equal(getWithdrawalFeeBasisPoints(99, brackets), null);
  assert.equal(isValidWithdrawalPolicy(100, 1000, [
    { minimumAmountMinor: 100, maximumAmountMinor: 499, basisPoints: 0 },
    { minimumAmountMinor: 500, maximumAmountMinor: 1000, basisPoints: 0 },
  ]), true);
  assert.equal(isValidWithdrawalPolicy(100, null, [
    { minimumAmountMinor: 100, maximumAmountMinor: 499, basisPoints: 0 },
    { minimumAmountMinor: 501, maximumAmountMinor: null, basisPoints: 0 },
  ]), false);
  assert.equal(isValidWithdrawalPolicy(100, null, [
    { minimumAmountMinor: 100, maximumAmountMinor: 500, basisPoints: 0 },
    { minimumAmountMinor: 500, maximumAmountMinor: null, basisPoints: 0 },
  ]), false);
  assert.equal(isValidWithdrawalPolicy(100, null, [
    { minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 10000 },
  ]), false);
  assert.equal(isValidWithdrawalPolicy(100, null, [
    { minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 9999 },
  ]), false);
  assert.equal(isValidWithdrawalPolicy(100, 1000, [
    { minimumAmountMinor: 100, maximumAmountMinor: 999, basisPoints: 0 },
  ]), false);
});

test("withdrawal package terms are captured in immutable payment, history, and request snapshots", () => {
  const policy = {
    minimumAmountMinor: 100,
    maximumAmountMinor: null,
    basisPoints: 125,
  };
  const packageItem = new RegistrationPackage({
    name: "Withdrawal policy",
    priceMinor: 100,
    minimumWithdrawalMinor: 250,
    maximumWithdrawalMinor: 5000,
    withdrawalFeeBrackets: [
      { minimumAmountMinor: 250, maximumAmountMinor: 5000, basisPoints: 125 },
    ],
  });
  assert.equal(packageItem.validateSync(), undefined);
  assert.equal(User.schema.path("packageWithdrawalFeeBrackets").options.default instanceof Function, true);
  assert.equal(PackageHistory.schema.path("packageSnapshot.minimumWithdrawalMinor").options.immutable, true);
  assert.equal(PackageHistory.schema.path("packageSnapshot.withdrawalFeeBrackets").options.immutable, true);
  assert.equal(PaymentVerification.schema.path("packageWithdrawalFeeBrackets").options.immutable, true);
  assert.equal(WithdrawalRequest.schema.path("amountMinor").options.immutable, true);
  assert.equal(WithdrawalRequest.schema.path("withdrawalPolicySnapshot").options.immutable, true);

  const request = new WithdrawalRequest({
    userId: "000000000000000000000001",
    amountMinor: 1000,
    provider: "easypaisa",
    encryptedPayoutDetails: "v1.encrypted.snapshot",
    feeMinor: 13,
    feeBasisPoints: policy.basisPoints,
    payoutMinor: 987,
    withdrawalPolicySnapshot: {
      packageName: "Withdrawal policy",
      minimumWithdrawalMinor: 250,
      maximumWithdrawalMinor: 5000,
      feeBrackets: [{
        minimumAmountMinor: 250,
        maximumAmountMinor: 5000,
        basisPoints: policy.basisPoints,
      }],
      appliedFeeBasisPoints: policy.basisPoints,
    },
  });
  assert.equal(request.validateSync(), undefined);
});

test("business-day rollover expires only earlier active assignments", () => {
  const filter = getPreviousActiveAssignmentFilter("user-id", "2026-10-13");
  assert.deepEqual(filter, {
    userId: "user-id",
    status: "active",
    businessDate: { $lt: "2026-10-13" },
  });
  assert.throws(() => getPreviousActiveAssignmentFilter("user-id", "not-a-date"), TypeError);
});

test("withdrawal methods are limited to configured supported methods", () => {
  assert.deepEqual(getConfiguredWithdrawalMethods(undefined), DEFAULT_WITHDRAWAL_METHODS);
  const configured = DEFAULT_WITHDRAWAL_METHODS.map((method) => ({ ...method }));
  configured[0] = { ...configured[0], enabled: false, displayName: "Wallet transfer" };
  assert.equal(normalizeWithdrawalMethods(configured)[0].displayName, "Wallet transfer");
  assert.equal(getConfiguredWithdrawalMethods(configured)[0].enabled, false);
  assert.equal(normalizeWithdrawalMethods(configured.slice(1)), null);
  assert.equal(normalizeWithdrawalMethods([
    ...configured.slice(0, 4),
    { ...configured[4], provider: configured[0].provider },
  ]), null);
  assert.equal(getConfiguredWithdrawalMethods([{ provider: "unsupported", enabled: true }])
    .every((method) => !method.enabled), true);
  assert.ok(PortalSettings.schema.path("withdrawalMethods"));
});

test("withdrawal payout snapshot is a required encrypted request field", () => {
  assert.equal(WithdrawalRequest.schema.path("encryptedPayoutDetails").options.immutable, true);
  assert.equal(WithdrawalRequest.schema.path("provider").options.immutable, true);
  const request = new WithdrawalRequest({
    userId: "000000000000000000000001",
    amountMinor: 500,
    provider: "easypaisa",
    encryptedPayoutDetails: "v1.encrypted.snapshot",
    payoutMinor: 500,
  });
  assert.equal(request.validateSync(), undefined);
  request.encryptedPayoutDetails = undefined;
  assert.ok(request.validateSync().errors.encryptedPayoutDetails);
});

test("withdrawal status transitions cannot repeat completed decisions", () => {
  assert.deepEqual(getWithdrawalStatusFilter("processing"), ["pending"]);
  assert.deepEqual(getWithdrawalStatusFilter("paid"), ["pending", "processing"]);
  assert.deepEqual(getWithdrawalStatusFilter("rejected"), ["pending", "processing"]);
  assert.equal(getWithdrawalStatusFilter("unknown"), null);
});

test("database connection accepts the existing local MONGO_URI name", () => {
  assert.equal(getMongoUri({ MONGO_URI: "mongodb://local/db" }), "mongodb://local/db");
  assert.equal(
    getMongoUri({ MONGO_URI: "mongodb://legacy/db", MONGODB_URI: "mongodb://primary/db" }),
    "mongodb://primary/db",
  );
  assert.equal(getMongoUri({}), "");
});

test("admin request categories are distinct and unread counts remain per category", () => {
  assert.deepEqual(
    ADMIN_REQUEST_CATEGORIES.map((category) => category.id),
    ["registration", "payment", "package", "deposit", "withdrawal", "task", "support"],
  );
  assert.equal(new Set(ADMIN_REQUEST_CATEGORIES.map((category) => category.target)).size, 7);
  assert.equal(getUnreadCount(8, 5), 3);
  assert.equal(getUnreadCount(2, 7), 0);
  assert.throws(() => getUnreadCount(-1, 0), RangeError);
});

test("admin request read marks are unique per admin, category, and request", () => {
  const index = AdminRequestRead.schema.indexes().find(([fields]) =>
    fields.adminId === 1 && fields.category === 1 && fields.requestId === 1,
  );
  assert.ok(index);
  assert.equal(index[1].unique, true);
  assert.equal(isDuplicateOnlyBulkWriteError({ writeErrors: [{ code: 11000 }] }), true);
  assert.equal(isDuplicateOnlyBulkWriteError({ writeErrors: [{ code: 11000 }, { code: 121 }] }), false);
  assert.equal(isDuplicateOnlyBulkWriteError({ writeErrors: [] }), false);
});

test("WhatsApp numbers normalize to country-code international format and remain optional for legacy schema data", () => {
  assert.equal(normalizeWhatsAppPhone(" +92 (300) 123-4567 "), "+923001234567");
  assert.equal(normalizeWhatsAppPhone("00923001234567"), "+923001234567");
  assert.equal(normalizeWhatsAppPhone("03001234567"), null);
  assert.equal(normalizeWhatsAppPhone("+123"), null);
  assert.equal(normalizeWhatsAppPhone("letters"), null);
  assert.equal(User.schema.path("whatsappPhone").options.default, "");
  assert.equal(User.schema.path("whatsappPhone").options.required, undefined);
  assert.equal(User.schema.path("whatsappPhone").options.select, false);
});

test("admin user search covers name, email, WhatsApp prefix, and exact user ID", () => {
  const textSearch = buildAdminUserSearchFilter("user@example.com");
  assert.ok(textSearch.$or.some((clause) => clause.email));
  assert.ok(buildAdminUserSearchFilter("+923001")?.$or.some((clause) => clause.whatsappPhone));
  assert.equal(buildAdminUserSearchFilter("64f000000000000000000001")._id.toString(), "64f000000000000000000001");
  assert.ok(buildAdminUserSearchFilter("A.*")?.$or[0].name.$regex.includes("\\."));
});

test("global admin search excludes user records and validates bounded queries", () => {
  assert.ok(ADMIN_GLOBAL_SEARCH_CATEGORIES.every((category) => category.id !== "users"));
  assert.equal(ADMIN_GLOBAL_SEARCH_CATEGORIES.filter((category) => category.superAdminOnly).length, 1);
  assert.deepEqual(buildGlobalSearchFilter("withdrawal"), { $text: { $search: "withdrawal" } });
  assert.equal(buildGlobalSearchFilter("64F000000000000000000001")._id.toString(), "64f000000000000000000001");
  assert.equal(validateGlobalSearch("wa"), true);
  assert.equal(validateGlobalSearch(" "), false);
  assert.equal(validateGlobalSearch("x".repeat(101)), false);
  assert.ok(PaymentVerification.schema.indexes().some(([fields]) => fields.transactionId === "text"));
  assert.ok(DepositRequest.schema.indexes().some(([fields]) => fields.senderName === "text"));
  assert.ok(SupportTicket.schema.indexes().some(([fields]) => fields.message === "text"));
});

test("contact CSV quotes fields and neutralizes spreadsheet formulas", () => {
  assert.equal(escapeCsvCell("=HYPERLINK(\"https://bad\")"), "\"'=HYPERLINK(\"\"https://bad\"\")\"");
  assert.equal(escapeCsvCell("  +123"), "\"'  +123\"");
  assert.equal(formatContactCsvRow(["Name", "Email", "WhatsApp"]), "\"Name\",\"Email\",\"WhatsApp\"\r\n");
  assert.equal(formatContactCsvRow(["A, B", "user@example.com", ""]).startsWith("\"A, B\",\"user@example.com\",\"\"\r\n"), true);
});
