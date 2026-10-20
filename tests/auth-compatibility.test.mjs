import test from "node:test";
import assert from "node:assert/strict";
import { isEmailVerified } from "../lib/email-verification.js";
import { getSuperAdminBootstrapPassword } from "../lib/super-admin-bootstrap.js";

test("legacy accounts without email verification metadata remain verified", () => {
  assert.equal(isEmailVerified({}), true);
  assert.equal(isEmailVerified({ emailVerified: undefined }), true);
  assert.equal(isEmailVerified({ emailVerified: true }), true);
  assert.equal(isEmailVerified({ emailVerified: false }), false);
  assert.equal(isEmailVerified({ emailVerified: null }), false);
  assert.equal(isEmailVerified(null), false);
});

test("an existing Super Admin does not require the bootstrap password", () => {
  assert.equal(getSuperAdminBootstrapPassword({ role: "superAdmin" }, undefined), null);
});

test("Super Admin creation still requires a valid bootstrap password", () => {
  assert.throws(() => getSuperAdminBootstrapPassword(null, undefined), /SUPER_ADMIN_PASSWORD/);
  assert.throws(() => getSuperAdminBootstrapPassword(null, "short"), /credentials are invalid/);
  assert.throws(
    () => getSuperAdminBootstrapPassword({ role: "user" }, undefined),
    /already assigned to a non-admin account/,
  );
});
