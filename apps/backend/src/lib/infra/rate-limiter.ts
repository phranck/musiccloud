/**
 * In-memory sliding-window rate limiter.
 *
 * Backend runs as a single Node process per Zerops replica, so a Map is
 * sufficient: no Redis or shared cache needed. If horizontal scaling ever
 * lands, this becomes per-instance (which is fine for its current purpose:
 * accidental client loops, not distributed abuse).
 *
 * Sliding window (not fixed bucket) because fixed buckets let a client fire
 * 2x the quota around the bucket boundary. The window here keeps a
 * per-key timestamp array and filters it on every check (O(n) per call,
 * but `n <= maxRequests` so it stays cheap).
 *
 * Memory hygiene (see Project rule "Rate limiter cleanup must be scheduled"):
 * the `cleanup()` method drops fully-expired entries. Without a scheduled
 * caller the Map grows unbounded across IPs seen at least once. The
 * `apiRateLimiter` export at the bottom of this file sets up that interval
 * for the shared instance.
 */
export class RateLimiter {
  private windows: Map<string, number[]> = new Map();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  isLimited(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.windows.get(key) ?? [];
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= this.maxRequests) {
      this.windows.set(key, timestamps);
      return true;
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);
    return false;
  }

  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [key, timestamps] of this.windows) {
      const filtered = timestamps.filter((t) => t > windowStart);
      if (filtered.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, filtered);
      }
    }
  }
}

// Shared instance used by public API routes. 30 requests per 60s protects the
// backend from runaway client loops (landing page retry storms, accidental
// useEffect polling) without throttling a human user.
//
// The limiter is keyed by `request.ip`, which is only meaningful when Fastify
// is configured with `trustProxy` behind a reverse proxy. Production sets the
// TRUST_PROXY env var in zerops.yml; see server.ts / resolve-public-get.ts
// for the corresponding rationale. Without it, all clients behind the ingress
// share a single bucket and a handful of requests trip the limit for
// everyone (the symptom user-visible as "Rate limit exceeded, retry in N
// seconds" after only 2-3 searches).
//
// Cleanup cadence is 5 minutes: aggressive enough that a burst of unique IPs
// does not bloat the Map for long, slack enough that cleanup itself is
// background noise on the event loop.
export const apiRateLimiter = new RateLimiter(30, 60_000);
setInterval(() => apiRateLimiter.cleanup(), 5 * 60 * 1000);
