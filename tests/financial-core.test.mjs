import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { Buffer } from "node:buffer";
import { getBusinessDayRange, isValidTimeZone } from "../lib/business-time.js";
import { getPackageExpiryDate, getRemainingPackageDays } from "../lib/package-dates.js";
import { readPaymentProof } from "../lib/payment-proof.js";
import { calculateWithdrawalFee } from "../lib/withdrawal-fee.js";
import { getWalletBalanceSnapshot } from "../lib/wallet-ledger.js";
import { decryptJson, encryptJson } from "../lib/encryption.js";
import PaymentReference from "../models/PaymentReference.js";
import WalletTransaction from "../models/WalletTransaction.js";

test("withdrawal fees use integer minor-unit rounding", () => {
  assert.equal(calculateWithdrawalFee(10_000, 25, 333), 358);
  assert.equal(calculateWithdrawalFee(1, 0, 5_000), 1);
  assert.throws(() => calculateWithdrawalFee(1.5, 0, 100), RangeError);
});

test("payout encryption requires a canonical 32-byte key and round-trips data", () => {
  const previousKey = process.env.ENCRYPTION_KEY;
  try {
    delete process.env.ENCRYPTION_KEY;
    assert.throws(() => encryptJson({ accountNumber: "123456789" }), {
      code: "ENCRYPTION_KEY_MISSING",
    });
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptJson({ accountNumber: "123456789" });
    assert.equal(decryptJson(encrypted).accountNumber, "123456789");
    process.env.ENCRYPTION_KEY = "not-a-valid-key";
    assert.throws(() => encryptJson({ accountNumber: "123456789" }), {
      code: "ENCRYPTION_KEY_INVALID",
    });
  } finally {
    if (previousKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = previousKey;
  }
});

test("wallet snapshots reconcile both wallets and reject impossible credits", () => {
  assert.deepEqual(
    getWalletBalanceSnapshot({ balanceMinor: 700 }, "earning", "credit", 125),
    { balanceBeforeMinor: 575, balanceAfterMinor: 700 },
  );
  assert.deepEqual(
    getWalletBalanceSnapshot({ depositBalanceMinor: 275 }, "deposit", "debit", 125),
    { balanceBeforeMinor: 400, balanceAfterMinor: 275 },
  );
  assert.throws(
    () => getWalletBalanceSnapshot({ balanceMinor: 10 }, "earning", "credit", 11),
    RangeError,
  );
});

test("package expiry is exactly the configured number of elapsed days", () => {
  const activatedAt = new Date("2026-03-01T12:30:00.000Z");
  assert.equal(
    getPackageExpiryDate(activatedAt, 30).toISOString(),
    "2026-03-31T12:30:00.000Z",
  );
  assert.throws(() => getPackageExpiryDate(activatedAt, 0), RangeError);
});

test("remaining package validity rounds up fractions and clamps expired packages", () => {
  const now = Date.parse("2026-03-01T12:30:00.000Z");
  assert.equal(getRemainingPackageDays("2026-03-02T12:29:59.999Z", now), 1);
  assert.equal(getRemainingPackageDays("2026-03-02T12:30:00.000Z", now), 1);
  assert.equal(getRemainingPackageDays("2026-03-01T12:29:59.999Z", now), 0);
  assert.equal(getRemainingPackageDays("invalid", now), null);
});

test("business-day bounds honor timezone offsets and daylight-saving changes", () => {
  const range = getBusinessDayRange(
    new Date("2026-03-08T16:00:00.000Z"),
    "America/New_York",
  );
  assert.equal(range.date, "2026-03-08");
  assert.equal(range.start.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal((range.end - range.start) / 3_600_000, 23);
  assert.equal(isValidTimeZone("Asia/Karachi"), true);
  assert.equal(isValidTimeZone("not-a-timezone"), false);
});

test("payment proof upload accepts supported signatures and rejects mismatches", async () => {
  const TestFile = globalThis.File;
  const jpeg = new TestFile([Uint8Array.from([0xff, 0xd8, 0xff])], "proof.jpg", {
    type: "image/jpeg",
  });
  const png = new TestFile(
    [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])],
    "proof.png",
    { type: "image/png" },
  );
  const executable = new TestFile([Uint8Array.from([0x4d, 0x5a, 0x90])], "proof.exe");
  const mismatchedImage = new TestFile(
    [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])],
    "proof.jpg",
    { type: "image/jpeg" },
  );
  const tooLarge = new TestFile([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png");

  assert.ok((await readPaymentProof(new FormDataWithProof(jpeg))).bytes);
  assert.ok((await readPaymentProof(new FormDataWithProof(png))).bytes);
  assert.match(
    (await readPaymentProof(new FormDataWithProof(executable))).error,
    /valid JPEG, PNG, or WebP/,
  );
  assert.match(
    (await readPaymentProof(new FormDataWithProof(mismatchedImage))).error,
    /valid JPEG, PNG, or WebP/,
  );
  assert.match(
    (await readPaymentProof(new FormDataWithProof(tooLarge))).error,
    /no larger than 5 MB/,
  );
  assert.match(
    (await readPaymentProof(new FormDataWithProof("not-a-file"))).error,
    /no larger than 5 MB/,
  );
});

test("financial schemas declare immutable idempotency and cross-workflow uniqueness", () => {
  const ledgerIndexes = WalletTransaction.schema.indexes();
  const paymentIndexes = PaymentReference.schema.indexes();
  assert.ok(
    ledgerIndexes.some(
      ([keys, options]) => keys.idempotencyKey === 1 && options.unique && options.sparse,
    ),
  );
  assert.ok(
    ledgerIndexes.some(
      ([keys]) => keys.userId === 1 && keys.type === 1 && keys.status === 1 && keys.businessDate === 1,
    ),
  );
  assert.ok(
    paymentIndexes.some(
      ([keys, options]) => keys.transactionIdKey === 1 && options.unique,
    ),
  );
  assert.equal(WalletTransaction.schema.path("amountMinor").options.immutable, true);
  assert.equal(PaymentReference.schema.path("transactionIdKey").options.immutable, true);
});

class FormDataWithProof {
  constructor(proof) {
    this.proof = proof;
  }

  get(name) {
    return name === "proof" ? this.proof : null;
  }
}
