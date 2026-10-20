import mongoose from "mongoose";
import HelpCenterCategory from "../models/HelpCenterCategory.js";
import { privateImageUrl } from "./cloudinary.js";
import { isValidTimeZone } from "./business-time.js";

export const DEFAULT_HELP_CATEGORIES = [
  "Getting Started",
  "Packages",
  "Daily Tasks",
  "Daily Reset",
  "Deposits & Payments",
  "Wallet & Earnings",
  "Withdrawals",
  "Referrals & Rewards",
  "Profile & Security",
  "Support",
  "Rules & Policies",
];

const HTML_TAG = /<\/?[a-z][^>]*>/i;
const ACTIVE_PDF_MARKERS = /\/(?:JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|RichMedia)\b/i;

export function slugify(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 180)
    : "";
}

export async function ensureHelpCategories() {
  const slugs = DEFAULT_HELP_CATEGORIES.map((name) => slugify(name));
  const existingSlugs = new Set(await HelpCenterCategory.distinct("slug", { slug: { $in: slugs } }));
  const missing = DEFAULT_HELP_CATEGORIES.map((name, sortOrder) => {
    const slug = slugify(name);
    if (existingSlugs.has(slug)) return null;
    return HelpCenterCategory.updateOne(
      { slug },
      { $setOnInsert: { name, slug, sortOrder, active: true } },
      { upsert: true },
    );
  }).filter(Boolean);
  if (!missing.length) return;
  const results = await Promise.allSettled(missing);
  const failures = results.filter((result) => result.status === "rejected");
  if (!failures.length) return;
  if (failures.some((result) => result.reason?.code !== 11000)) throw failures[0].reason;
  const seededCount = await HelpCenterCategory.countDocuments({ slug: { $in: slugs } });
  if (seededCount < slugs.length) throw failures[0].reason;
}

export function getHelpTimeZone(configuredZone = process.env.BUSINESS_TIME_ZONE || "UTC") {
  const zone = configuredZone;
  if (!isValidTimeZone(zone)) throw new Error("BUSINESS_TIME_ZONE is invalid.");
  return zone;
}

function scheduleDate(value, timeZone = getHelpTimeZone()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = guess;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
    const formatted = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
    const represented = Date.UTC(
      Number(formatted.year),
      Number(formatted.month) - 1,
      Number(formatted.day),
      Number(formatted.hour),
      Number(formatted.minute),
    );
    const next = timestamp + guess - represented;
    if (next === timestamp) break;
    timestamp = next;
  }
  const check = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const result = Object.fromEntries(check.map(({ type, value: partValue }) => [type, partValue]));
  if (
    Number(result.year) !== year ||
    Number(result.month) !== month ||
    Number(result.day) !== day ||
    Number(result.hour) !== hour ||
    Number(result.minute) !== minute
  ) return null;
  return new Date(timestamp);
}

export function formatScheduleForInput(value, timeZone = getHelpTimeZone()) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const result = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${result.year}-${result.month}-${result.day}T${result.hour}:${result.minute}`;
}

export function parseVideoUrl(value) {
  if (typeof value !== "string" || value.length > 300) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    let provider;
    let videoId;
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname)) {
      provider = "youtube";
      videoId = url.hostname === "youtu.be"
        ? url.pathname.slice(1)
        : url.pathname === "/watch"
          ? url.searchParams.get("v")
          : url.pathname.split("/").filter(Boolean).pop();
    } else if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(url.hostname)) {
      provider = "vimeo";
      videoId = url.pathname.split("/").filter(Boolean).pop();
    } else {
      return null;
    }
    if (!/^[A-Za-z0-9_-]{5,32}$/.test(videoId || "")) return null;
    return { provider, videoId };
  } catch {
    return null;
  }
}

function isSafeText(value, maxLength, allowEmpty = false) {
  return typeof value === "string" &&
    value.length <= maxLength &&
    (allowEmpty || value.trim().length > 0) &&
    !HTML_TAG.test(value) &&
    !/(?:javascript\s*:|data\s*:\s*text\/html|<\s*script)/i.test(value);
}

function validateStringList(value, { maxItems, maxLength, allowEmpty = false }) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  if (!value.every((item) => isSafeText(item, maxLength, allowEmpty))) return null;
  return value.map((item) => item.trim()).filter((item) => allowEmpty || item);
}

export function validateGuidePayload(body, { timeZone = getHelpTimeZone() } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid guide." };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const slug = slugify(body.slug || title);
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (
    !isSafeText(title, 160) ||
    !slug ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    !isSafeText(summary, 400)
  ) return { error: "Enter a valid title, URL slug, and summary." };
  if (!mongoose.isValidObjectId(body.categoryId)) return { error: "Choose a valid category." };
  const paragraphs = validateStringList(body.paragraphs, { maxItems: 30, maxLength: 4000 });
  const steps = validateStringList(body.steps, { maxItems: 40, maxLength: 1000 });
  const tags = validateStringList(body.tags, { maxItems: 12, maxLength: 32 })
    ?.map((tag) => tag.toLowerCase());
  if (!paragraphs || !steps || !tags) return { error: "Guide text, steps, or tags contain invalid content." };
  if (!Array.isArray(body.images) || body.images.length > 12) return { error: "Guide image limit exceeded." };
  const images = [];
  for (const image of body.images) {
    if (
      !image ||
      typeof image.publicId !== "string" ||
      !/^ratewell\/help-center\/images\/[A-Za-z0-9_-]{12,80}$/.test(image.publicId) ||
      !isSafeText(image.alt, 160)
    ) return { error: "One or more guide images are invalid." };
    images.push({ publicId: image.publicId, alt: image.alt.trim() });
  }
  if (!Array.isArray(body.videos) || body.videos.length > 8) return { error: "Guide video limit exceeded." };
  const videos = [];
  for (const item of body.videos) {
    const parsed = parseVideoUrl(item?.url);
    if (!parsed) return { error: "Videos must use an approved HTTPS YouTube or Vimeo URL." };
    videos.push(parsed);
  }
  if (!Array.isArray(body.attachments) || body.attachments.length > 8) return { error: "Guide attachment limit exceeded." };
  const attachments = [];
  for (const item of body.attachments) {
    if (
      !item ||
      typeof item.publicId !== "string" ||
      !/^ratewell\/help-center\/files\/[A-Za-z0-9_-]{12,80}\.pdf$/.test(item.publicId) ||
      !isSafeText(item.filename, 120) ||
      !Number.isInteger(item.sizeBytes) ||
      item.sizeBytes < 1 ||
      item.sizeBytes > 8 * 1024 * 1024
    ) return { error: "One or more guide attachments are invalid." };
    attachments.push({
      publicId: item.publicId,
      filename: item.filename.trim(),
      sizeBytes: item.sizeBytes,
    });
  }
  if (!["public", "private"].includes(body.visibility)) return { error: "Choose a valid guide visibility." };
  if (!["draft", "scheduled", "published", "archived"].includes(body.status)) return { error: "Choose a valid publishing state." };
  if (typeof body.featured !== "boolean") return { error: "Featured must be enabled or disabled." };
  const sortOrder = Number(body.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) return { error: "Choose a valid display order." };
  const relatedGuideIds = body.relatedGuideIds === undefined
    ? []
    : body.relatedGuideIds;
  if (
    !Array.isArray(relatedGuideIds) ||
    relatedGuideIds.length > 8 ||
    !relatedGuideIds.every((id) => typeof id === "string" && mongoose.isValidObjectId(id)) ||
    new Set(relatedGuideIds.map((id) => id.toLowerCase())).size !== relatedGuideIds.length
  ) return { error: "Related guide selection is invalid." };
  if (!isSafeText(body.updateNote ?? "", 300, true)) return { error: "Update note is invalid." };

  let publishAt = null;
  if (body.status === "scheduled") {
    publishAt = scheduleDate(body.publishAt, timeZone);
    if (!publishAt || publishAt.getTime() <= Date.now()) {
      return { error: "Choose a future publish time in the configured business timezone." };
    }
  } else if (body.status === "published") {
    publishAt = new Date();
  } else if (body.publishAt) {
    return { error: "A publish time is only valid for scheduled guides." };
  }

  return {
    data: {
      title,
      slug,
      summary,
      categoryId: body.categoryId,
      paragraphs,
      steps,
      images,
      videos,
      attachments,
      visibility: body.visibility,
      status: body.status,
      publishAt,
      publishedAt: body.status === "published" ? new Date() : body.status === "scheduled" ? publishAt : null,
      featured: body.featured,
      sortOrder,
      tags,
      relatedGuideIds,
      updateNote: (body.updateNote || "").trim(),
    },
  };
}

export function hasUnsafePdfContent(bytes) {
  return ACTIVE_PDF_MARKERS.test(bytes.toString("latin1"));
}

export function isSafeHelpPdf(bytes) {
  return Buffer.isBuffer(bytes) &&
    bytes.length >= 8 &&
    bytes.length <= 8 * 1024 * 1024 &&
    bytes.subarray(0, 5).toString("ascii") === "%PDF-" &&
    !hasUnsafePdfContent(bytes);
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isPublicGuideAt(guide, now = new Date()) {
  if (guide?.visibility !== "public" || !(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
  if (guide.status === "published") return !guide.publishAt || new Date(guide.publishAt) <= now;
  return guide.status === "scheduled" && Boolean(guide.publishAt) && new Date(guide.publishAt) <= now;
}

export function canAccessGuideAsset(guide, role, now = new Date()) {
  return isPublicGuideAt(guide, now) || role === "superAdmin";
}

export function publicGuideFilter(now = new Date()) {
  return {
    visibility: "public",
    $or: [
      { status: "published", $or: [{ publishAt: null }, { publishAt: { $lte: now } }] },
      { status: "scheduled", publishAt: { $lte: now } },
    ],
  };
}

export function serializeGuide(guide, { includeAssets = false, timeZone = "UTC" } = {}) {
  const item = guide.toObject ? guide.toObject() : guide;
  return {
    id: item._id.toString(),
    title: item.title,
    slug: item.slug,
    summary: item.summary,
    category: item.categoryId?.name || "",
    categoryId: item.categoryId?._id?.toString() || item.categoryId?.toString() || "",
    paragraphs: item.paragraphs || [],
    steps: item.steps || [],
    images: (item.images || []).map((image) => ({
      alt: image.alt,
      url: privateImageUrl(image.publicId, Math.floor(Date.now() / 1000) + 300),
      ...(includeAssets ? { publicId: image.publicId } : {}),
    })),
    videos: (item.videos || []).map(({ provider, videoId }) => ({
      provider,
      embedUrl: provider === "youtube"
        ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`
        : `https://player.vimeo.com/video/${encodeURIComponent(videoId)}`,
    })),
    attachments: (item.attachments || []).map((file) => ({
      filename: file.filename,
      sizeBytes: file.sizeBytes,
      url: `/api/help-center/assets?slug=${encodeURIComponent(item.slug)}&publicId=${encodeURIComponent(file.publicId)}`,
      ...(includeAssets ? { publicId: file.publicId } : {}),
    })),
    visibility: item.visibility,
    status: item.status === "scheduled" && item.publishAt && item.publishAt <= new Date() ? "published" : item.status,
    publishAt: item.publishAt?.toISOString() || "",
    publishAtLocal: formatScheduleForInput(item.publishAt, timeZone),
    publishedAt: item.publishedAt?.toISOString() || "",
    featured: item.featured,
    sortOrder: item.sortOrder,
    tags: item.tags || [],
    relatedGuideIds: (item.relatedGuideIds || []).map((id) => id.toString()),
    updateNote: item.updateNote || "",
    views: item.views || 0,
    version: item.version || 1,
    updatedAt: item.updatedAt?.toISOString() || "",
    createdAt: item.createdAt?.toISOString() || "",
  };
}
