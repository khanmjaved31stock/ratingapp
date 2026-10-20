import { createHash } from "node:crypto";
import RateLimitBucket from "@/models/RateLimitBucket";
import { getRequestIp } from "@/lib/request-ip";

export async function consumeRateLimit(request, scope, { limit, windowMs, identity }) {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const limiterIdentity = typeof identity === "string"
    ? `identity:${identity}`
    : `ip:${getRequestIp(request) || "unknown"}`;
  const addressHash = createHash("sha256").update(limiterIdentity).digest("hex");
  const key = `${scope}:${addressHash}:${windowStart}`;

  try {
    const result = await RateLimitBucket.findOneAndUpdate(
      { key },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(windowStart + windowMs * 2) },
      },
      { upsert: true, new: true },
    ).lean();
    return { allowed: result.count <= limit, retryAfterMs: windowStart + windowMs - now };
  } catch (error) {
    if (error?.code === 11000) {
      const result = await RateLimitBucket.findOneAndUpdate(
        { key },
        { $inc: { count: 1 } },
        { new: true },
      ).lean();
      return { allowed: result.count <= limit, retryAfterMs: windowStart + windowMs - now };
    }
    throw error;
  }
}
