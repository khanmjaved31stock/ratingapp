export const ADMIN_REQUEST_CATEGORIES = [
  { id: "registration", label: "Awaiting registration payment", target: "registration-requests" },
  { id: "payment", label: "Payment verification", target: "payment-approvals" },
  { id: "package", label: "Package activation / renewal", target: "package-requests" },
  { id: "deposit", label: "Deposit verification", target: "deposit-approvals" },
  { id: "withdrawal", label: "Withdrawal requests", target: "withdrawals" },
  { id: "task", label: "Task reward reviews", target: "feedback" },
  { id: "support", label: "Help-line / support", target: "support" },
];

export function isDuplicateOnlyBulkWriteError(error) {
  const errors = error?.writeErrors;
  return Array.isArray(errors) &&
    errors.length > 0 &&
    errors.every((item) => item.code === 11000);
}

export function getUnreadCount(total, readCount) {
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(readCount) || readCount < 0) {
    throw new RangeError("Request notification counts must be non-negative safe integers.");
  }
  return Math.max(0, total - readCount);
}
