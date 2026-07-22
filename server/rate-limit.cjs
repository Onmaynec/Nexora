"use strict";

function positiveInteger(value, fallback, name) {
  const normalized = Number(value ?? fallback);
  if (!Number.isSafeInteger(normalized) || normalized < 1) throw new TypeError(`${name} must be a positive safe integer.`);
  return normalized;
}

function timestamp(clock) {
  const value = typeof clock === "function" ? clock() : Date.now();
  if (!Number.isFinite(Number(value))) throw new TypeError("Rate limiter clock must return a finite timestamp.");
  return Number(value);
}

function createSlidingWindowRateLimiter({ windowMs = 60_000, limit = 30, maxBuckets = 10_000, clock = Date.now } = {}) {
  const boundedWindow = positiveInteger(windowMs, 60_000, "windowMs");
  const boundedLimit = positiveInteger(limit, 30, "limit");
  const boundedBuckets = positiveInteger(maxBuckets, 10_000, "maxBuckets");
  const buckets = new Map();

  function prune(now) {
    for (const [key, bucket] of buckets) {
      const recent = bucket.timestamps.filter((item) => now - item < boundedWindow);
      if (!recent.length) buckets.delete(key);
      else if (recent.length !== bucket.timestamps.length) buckets.set(key, { timestamps: recent, lastSeenAt: bucket.lastSeenAt });
    }
    if (buckets.size <= boundedBuckets) return;
    const overflow = [...buckets.entries()]
      .sort((first, second) => first[1].lastSeenAt - second[1].lastSeenAt)
      .slice(0, buckets.size - boundedBuckets);
    for (const [key] of overflow) buckets.delete(key);
  }

  function consume(rawKey) {
    const key = String(rawKey || "anonymous").slice(0, 256);
    const now = timestamp(clock);
    prune(now);
    const recent = (buckets.get(key)?.timestamps || []).filter((item) => now - item < boundedWindow);
    if (recent.length >= boundedLimit) {
      buckets.set(key, { timestamps: recent, lastSeenAt: now });
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(1, recent[0] + boundedWindow - now),
      };
    }
    recent.push(now);
    buckets.set(key, { timestamps: recent, lastSeenAt: now });
    prune(now);
    return {
      allowed: true,
      remaining: Math.max(0, boundedLimit - recent.length),
      retryAfterMs: 0,
    };
  }

  return {
    consume,
    clear() { buckets.clear(); },
    size() { return buckets.size; },
  };
}

module.exports = { createSlidingWindowRateLimiter };
