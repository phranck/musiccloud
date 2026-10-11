import { describe, expect, it } from "vitest";
import { apiRateLimiter, SITE_RESOLVE_REQUESTS_PER_MINUTE, siteResolveRateLimiter } from "./rate-limiter.js";

describe("siteResolveRateLimiter", () => {
  /**
   * One search with a pick costs two requests. Ten per minute stopped a person
   * after five searches, so the site's resolves have a budget of their own.
   */
  it("admits a visitor's full minute of resolves and refuses the next one", () => {
    const visitor = "203.0.113.10";
    for (let request = 0; request < SITE_RESOLVE_REQUESTS_PER_MINUTE; request++) {
      expect(siteResolveRateLimiter.check(visitor).limited).toBe(false);
    }

    const refused = siteResolveRateLimiter.check(visitor);
    expect(refused.limited).toBe(true);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("does not draw on the shared API budget", () => {
    const visitor = "203.0.113.11";
    for (let request = 0; request < SITE_RESOLVE_REQUESTS_PER_MINUTE; request++) {
      siteResolveRateLimiter.check(visitor);
    }

    expect(apiRateLimiter.check(visitor).limited).toBe(false);
  });
});
