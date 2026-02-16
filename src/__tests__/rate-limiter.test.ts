import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../lib/rate-limiter";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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
});
