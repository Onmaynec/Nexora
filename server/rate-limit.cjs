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

  function deleteOldest() {
    const oldest = buckets.keys().next();
    if (!oldest.done) buckets.delete(oldest.value);
  }

  function pruneExpired(now, budget = 64) {
    let inspected = 0;
    for (const [key, bucket] of buckets) {
      if (inspected >= budget) break;
      inspected += 1;
      const recent = bucket.timestamps.filter((item) => now - item < boundedWindow);
      if (!recent.length) buckets.delete(key);
      else if (recent.length !== bucket.timestamps.length) {
        buckets.delete(key);
        buckets.set(key, { timestamps: recent, lastSeenAt: bucket.lastSeenAt });
      }
    }
  }

  function storeBucket(key, timestamps, now) {
    buckets.delete(key);
    while (buckets.size >= boundedBuckets) deleteOldest();
    buckets.set(key, { timestamps, lastSeenAt: now });
  }

  function consume(rawKey) {
    const key = String(rawKey || "anonymous").slice(0, 256);
    const now = timestamp(clock);
    pruneExpired(now);
    const recent = (buckets.get(key)?.timestamps || []).filter((item) => now - item < boundedWindow);
    if (recent.length >= boundedLimit) {
      storeBucket(key, recent, now);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(1, recent[0] + boundedWindow - now),
      };
    }
    recent.push(now);
    storeBucket(key, recent, now);
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
