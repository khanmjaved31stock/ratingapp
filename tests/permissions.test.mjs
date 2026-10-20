import test from "node:test";
import assert from "node:assert/strict";
import { hasRequiredRole } from "../lib/role-permissions.js";

test("staff permissions do not implicitly elevate Helpline Admins or users", () => {
  assert.equal(hasRequiredRole("superAdmin", ["superAdmin"]), true);
  assert.equal(hasRequiredRole("helpAdmin", ["superAdmin"]), false);
  assert.equal(hasRequiredRole("user", ["superAdmin", "helpAdmin"]), false);
  assert.equal(hasRequiredRole("helpAdmin", ["superAdmin", "helpAdmin"]), true);
});

test("moderator access remains limited to explicitly granted roles", () => {
  assert.equal(hasRequiredRole("moderator", ["moderator"]), true);
  assert.equal(hasRequiredRole("moderator", ["superAdmin"]), false);
});
