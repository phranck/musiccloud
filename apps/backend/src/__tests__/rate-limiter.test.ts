import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DynamicRateLimiter, RateLimiter } from "@/lib/infra/rate-limiter";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete process.env.DISABLE_RATE_LIMIT;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.DISABLE_RATE_LIMIT;
  });

  it("should allow requests below limit", () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.isLimited("client-1")).toBe(false);
    expect(limiter.isLimited("client-1")).toBe(false);
    expect(limiter.isLimited("client-1")).toBe(false);
  });

  it("should block requests at the limit", () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.isLimited("client-1"); // 1
    limiter.isLimited("client-1"); // 2
    expect(limiter.isLimited("client-1")).toBe(true); // 3 -> blocked
  });

  it("should return rate limit metadata while blocking", () => {
    const limiter = new RateLimiter(2, 60_000);
    expect(limiter.check("client-1")).toMatchObject({
      limited: false,
      limit: 2,
      remaining: 1,
      retryAfterSeconds: 0,
      windowSeconds: 60,
    });
    vi.advanceTimersByTime(10_000);
    expect(limiter.check("client-1")).toMatchObject({
      limited: false,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 0,
      windowSeconds: 60,
    });

    vi.advanceTimersByTime(5_000);

    expect(limiter.check("client-1")).toMatchObject({
      limited: true,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 45,
      windowSeconds: 60,
    });
  });

  it("should track keys independently", () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.isLimited("client-1")).toBe(false);
    expect(limiter.isLimited("client-2")).toBe(false);
    expect(limiter.isLimited("client-1")).toBe(true);
    expect(limiter.isLimited("client-2")).toBe(true);
  });

  it("should allow requests after window expires", () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.isLimited("client-1")).toBe(false);
    expect(limiter.isLimited("client-1")).toBe(true);

    vi.advanceTimersByTime(61_000);

    expect(limiter.isLimited("client-1")).toBe(false);
  });

  it("should clean up expired entries", () => {
    const limiter = new RateLimiter(5, 60_000);
    limiter.isLimited("client-1");
    limiter.isLimited("client-2");

    vi.advanceTimersByTime(61_000);
    limiter.cleanup();

    // After cleanup, internal map should be empty (no way to check directly,
    // but we can verify behavior: requests should work again)
    expect(limiter.isLimited("client-1")).toBe(false);
    expect(limiter.isLimited("client-2")).toBe(false);
  });

  it("should not remove entries still within window during cleanup", () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.isLimited("client-1"); // timestamp at t=0

    vi.advanceTimersByTime(30_000); // t=30s, still in window
    limiter.cleanup();

    // client-1 should still be limited (1 request in window, limit is 1)
    expect(limiter.isLimited("client-1")).toBe(true);
  });

  it("should skip limiting when explicitly disabled", () => {
    process.env.DISABLE_RATE_LIMIT = "true";
    const limiter = new RateLimiter(1, 60_000);

    expect(limiter.isLimited("client-1")).toBe(false);
    expect(limiter.isLimited("client-1")).toBe(false);
    expect(limiter.isLimited("client-1")).toBe(false);
  });
});

describe("DynamicRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete process.env.DISABLE_RATE_LIMIT;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.DISABLE_RATE_LIMIT;
  });

  it("should enforce the per-call cap", () => {
    const limiter = new DynamicRateLimiter(60_000);
    expect(limiter.check("client-1", 2).limited).toBe(false);
    expect(limiter.check("client-1", 2).limited).toBe(false);
    expect(limiter.check("client-1", 2)).toMatchObject({
      limited: true,
      limit: 2,
      remaining: 0,
      windowSeconds: 60,
    });
  });

  it("should apply different caps per key", () => {
    const limiter = new DynamicRateLimiter(60_000);
    expect(limiter.check("small", 1).limited).toBe(false);
    expect(limiter.check("small", 1).limited).toBe(true);
    // A generous cap on another key is unaffected by the small key's hits.
    expect(limiter.check("large", 100)).toMatchObject({ limited: false, remaining: 99 });
  });

  it("should pick up a raised cap immediately (admin edits take effect live)", () => {
    const limiter = new DynamicRateLimiter(60_000);
    limiter.check("client-1", 1);
    expect(limiter.check("client-1", 1).limited).toBe(true);
    // Same key, higher cap on the next call: previous hits still count,
    // but the new headroom applies right away.
    expect(limiter.check("client-1", 3).limited).toBe(false);
  });

  it("should allow requests again after the window expires", () => {
    const limiter = new DynamicRateLimiter(60_000);
    limiter.check("client-1", 1);
    expect(limiter.check("client-1", 1).limited).toBe(true);

    vi.advanceTimersByTime(61_000);

    expect(limiter.check("client-1", 1).limited).toBe(false);
  });

  it("should clean up expired entries", () => {
    const limiter = new DynamicRateLimiter(60_000);
    limiter.check("client-1", 1);

    vi.advanceTimersByTime(61_000);
    limiter.cleanup();

    expect(limiter.check("client-1", 1).limited).toBe(false);
  });

  it("should skip limiting when explicitly disabled", () => {
    process.env.DISABLE_RATE_LIMIT = "true";
    const limiter = new DynamicRateLimiter(60_000);

    expect(limiter.check("client-1", 1).limited).toBe(false);
    expect(limiter.check("client-1", 1).limited).toBe(false);
  });
});
