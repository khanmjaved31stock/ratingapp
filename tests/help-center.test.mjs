import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Buffer } from "node:buffer";
import HelpCenterCategory from "../models/HelpCenterCategory.js";
import HelpGuide from "../models/HelpGuide.js";
import HelpGuideFeedback from "../models/HelpGuideFeedback.js";
import HelpGuideVersion from "../models/HelpGuideVersion.js";
import {
  hasUnsafePdfContent,
  isSafeHelpPdf,
  canAccessGuideAsset,
  isPublicGuideAt,
  parseVideoUrl,
  publicGuideFilter,
  validateGuidePayload,
} from "../lib/help-center.js";
import { hasRequiredRole } from "../lib/role-permissions.js";

const categoryId = new mongoose.Types.ObjectId().toString();

function payload(overrides = {}) {
  return {
    title: "Getting started",
    slug: "getting-started",
    summary: "How to get started with Ratewell.",
    categoryId,
    paragraphs: ["Read these instructions carefully."],
    steps: ["Open the portal.", "Follow the instructions."],
    images: [],
    videos: [],
    attachments: [],
    visibility: "public",
    status: "published",
    publishAt: "",
    featured: false,
    sortOrder: 0,
    tags: ["account"],
    relatedGuideIds: [],
    updateNote: "",
    ...overrides,
  };
}

test("only public published or due-scheduled guides are public", () => {
  const now = new Date("2026-10-09T12:00:00.000Z");
  assert.equal(isPublicGuideAt({ visibility: "public", status: "published" }, now), true);
  assert.equal(isPublicGuideAt({ visibility: "private", status: "published" }, now), false);
  assert.equal(isPublicGuideAt({ visibility: "public", status: "draft" }, now), false);
  assert.equal(isPublicGuideAt({ visibility: "public", status: "scheduled", publishAt: "2026-10-09T11:00:00Z" }, now), true);
  assert.equal(isPublicGuideAt({ visibility: "public", status: "scheduled", publishAt: "2026-10-09T13:00:00Z" }, now), false);
  assert.deepEqual(publicGuideFilter(now).visibility, "public");
  assert.equal(canAccessGuideAsset({ visibility: "private", status: "draft" }, "helpAdmin", now), false);
  assert.equal(canAccessGuideAsset({ visibility: "private", status: "draft" }, "superAdmin", now), true);
});

test("admin role boundaries allow Super Admin management but not Helpline Admin escalation", () => {
  assert.equal(hasRequiredRole("superAdmin", ["superAdmin"]), true);
  assert.equal(hasRequiredRole("helpAdmin", ["superAdmin"]), false);
  assert.equal(hasRequiredRole("helpAdmin", ["superAdmin", "helpAdmin"]), true);
  assert.equal(hasRequiredRole("user", ["superAdmin", "helpAdmin"]), false);
});

test("guide validation rejects markup, unsafe embeds, invalid visibility, and unsupported assets", () => {
  assert.ok(validateGuidePayload(payload({ paragraphs: ["<script>alert(1)</script>"] })).error);
  assert.ok(validateGuidePayload(payload({ videos: [{ url: "https://evil.example/video" }] })).error);
  assert.ok(validateGuidePayload(payload({ videos: [{ url: "javascript:alert(1)" }] })).error);
  assert.ok(validateGuidePayload(payload({ visibility: "internal" })).error);
  assert.ok(validateGuidePayload(payload({
    images: [{ publicId: "https://example.test/image.png", alt: "guide image" }],
  })).error);
  assert.ok(validateGuidePayload(payload({
    attachments: [{ publicId: "ratewell/help-center/files/arbitrary.pdf", filename: "x.pdf", sizeBytes: 20 }],
  })).error);
});

test("approved provider URLs are reduced to safe video identifiers", () => {
  assert.deepEqual(parseVideoUrl("https://youtu.be/abc_12345"), { provider: "youtube", videoId: "abc_12345" });
  assert.deepEqual(parseVideoUrl("https://www.youtube.com/watch?v=abc_12345"), { provider: "youtube", videoId: "abc_12345" });
  assert.deepEqual(parseVideoUrl("https://vimeo.com/12345678"), { provider: "vimeo", videoId: "12345678" });
  assert.equal(parseVideoUrl("https://youtube.com.evil.example/watch?v=abc_12345"), null);
  assert.equal(parseVideoUrl("http://vimeo.com/12345678"), null);
});

test("scheduled publication requires a future local business-time value", () => {
  const futureDate = new Date(Date.now() + 86400000);
  const localValue = `${futureDate.getUTCFullYear()}-${String(futureDate.getUTCMonth() + 1).padStart(2, "0")}-${String(futureDate.getUTCDate()).padStart(2, "0")}T${String(futureDate.getUTCHours()).padStart(2, "0")}:${String(futureDate.getUTCMinutes()).padStart(2, "0")}`;
  assert.equal(validateGuidePayload(payload({
    status: "scheduled",
    publishAt: localValue,
  }), { timeZone: "UTC" }).error, undefined);
  assert.ok(validateGuidePayload(payload({
    status: "scheduled",
    publishAt: "2020-01-01T00:00",
  }), { timeZone: "UTC" }).error);
});

test("PDF upload validation rejects active-content markers", () => {
  const safePdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>");
  assert.equal(hasUnsafePdfContent(safePdf), false);
  assert.equal(isSafeHelpPdf(safePdf), true);
  assert.equal(hasUnsafePdfContent(Buffer.from("%PDF-1.7\n/OpenAction 5 0 R")), true);
  assert.equal(hasUnsafePdfContent(Buffer.from("%PDF-1.7\n/JavaScript (alert)")), true);
  assert.equal(isSafeHelpPdf(Buffer.from("<html>not pdf</html>")), false);
});

test("help center collections include state, feedback, and immutable version indexes", () => {
  assert.deepEqual(HelpGuide.schema.path("status").enumValues, ["draft", "scheduled", "published", "archived"]);
  assert.ok(HelpGuide.schema.indexes().some(([keys, options]) => keys.slug === 1 && options.unique));
  assert.ok(HelpGuideVersion.schema.indexes().some(([keys, options]) => keys.guideId === 1 && keys.version === -1 && options.unique));
  assert.ok(HelpGuideFeedback.schema.indexes().some(([keys]) => keys.kind === 1 && keys.status === 1));
  assert.ok(HelpCenterCategory.schema.indexes().some(([keys, options]) => keys.slug === 1 && options.unique));
});
