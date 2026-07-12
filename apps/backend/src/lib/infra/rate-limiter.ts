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
import type { FastifyRequest } from "fastify";

export interface RateLimitCheck {
  limited: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  windowSeconds: number;
}

/**
 * Shared sliding-window check over a per-key timestamp store. Both limiter
 * classes delegate here so the window semantics (filtering, retry-after
 * math, the `DISABLE_RATE_LIMIT` escape hatch) live in exactly one place.
 *
 * @param windows - The caller's per-key timestamp store (mutated in place).
 * @param key - Bucket key (client IP, client id, …).
 * @param maxRequests - Maximum requests allowed inside the window.
 * @param windowMs - Window length in milliseconds.
 * @returns The check result, with `limited: true` once the quota is hit.
 */
function checkWindow(
  windows: Map<string, number[]>,
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitCheck {
  const windowSeconds = Math.ceil(windowMs / 1000);
  if (isRateLimitDisabled()) {
    return {
      limited: false,
      limit: maxRequests,
      remaining: maxRequests,
      retryAfterSeconds: 0,
      windowSeconds,
    };
  }

  const now = Date.now();
  const windowStart = now - windowMs;

  let timestamps = windows.get(key) ?? [];
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length >= maxRequests) {
    windows.set(key, timestamps);
    const oldestTimestamp = timestamps[0] ?? now;
    const retryAfterMs = Math.max(0, oldestTimestamp + windowMs - now);
    return {
      limited: true,
      limit: maxRequests,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      windowSeconds,
    };
  }

  timestamps.push(now);
  windows.set(key, timestamps);
  return {
    limited: false,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - timestamps.length),
    retryAfterSeconds: 0,
    windowSeconds,
  };
}

/**
 * Drops fully-expired keys from a timestamp store and trims the rest.
 * Shared by both limiter classes' `cleanup()` (see the file header for why
 * cleanup must be scheduled).
 *
 * @param windows - The per-key timestamp store (mutated in place).
 * @param windowMs - Window length in milliseconds; entries older than this are dropped.
 */
function cleanupWindows(windows: Map<string, number[]>, windowMs: number): void {
  const now = Date.now();
  const windowStart = now - windowMs;
  for (const [key, timestamps] of windows) {
    const filtered = timestamps.filter((t) => t > windowStart);
    if (filtered.length === 0) {
      windows.delete(key);
    } else {
      windows.set(key, filtered);
    }
  }
}

export class RateLimiter {
  private windows: Map<string, number[]> = new Map();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): RateLimitCheck {
    return checkWindow(this.windows, key, this.maxRequests, this.windowMs);
  }

  isLimited(key: string): boolean {
    return this.check(key).limited;
  }

  cleanup(): void {
    cleanupWindows(this.windows, this.windowMs);
  }
}

/**
 * Sliding-window limiter with a fixed window but a **per-call request cap**,
 * for quotas that vary by caller — the public-API per-client limits
 * (`api_clients.requestsPerMinute` / `requestsPerDay`) are admin-editable
 * per client, so the cap cannot live in the constructor like
 * {@link RateLimiter}'s.
 *
 * One instance per window length; the caller passes the client's own cap on
 * every `check`. Memory note: a key holds up to `maxRequests` timestamps, so
 * the day-window instance can hold up to `requestsPerDay` entries per active
 * client. Fine at the current scale (single-digit clients); the deferred
 * usage-analytics phase replaces this with persistent counting if that ever
 * changes.
 */
export class DynamicRateLimiter {
  private windows: Map<string, number[]> = new Map();

  /**
   * @param windowMs - Window length in milliseconds, fixed for this instance.
   */
  constructor(private readonly windowMs: number) {}

  /**
   * Records a hit for `key` and reports whether it exceeded `maxRequests`
   * within this instance's window.
   *
   * @param key - Bucket key (the api_client id).
   * @param maxRequests - The caller's current cap for this window.
   * @returns The check result, with `limited: true` once the quota is hit.
   */
  check(key: string, maxRequests: number): RateLimitCheck {
    return checkWindow(this.windows, key, maxRequests, this.windowMs);
  }

  cleanup(): void {
    cleanupWindows(this.windows, this.windowMs);
  }
}

// Shared bucket for the public API surface (Resolve, Share, Share-Preview,
// Auth, Link, Artist). 10 requests per 60s per client IP — strict enough
// to bound abuse and runaway client loops without blocking human use.
// Asset routes (Genre-Artwork) deliberately do NOT call into this limiter
// because they serve immutable cached JPEGs in parallel from a Browse grid;
// the global @fastify/rate-limit at 300/min still covers them.
//
// The limiter is keyed by `request.ip`. For that to resolve to the real
// end-user IP behind the Zerops ingress, two pre-conditions must hold:
//   1. Fastify trusts the upstream proxy chain. Production sets
//      TRUST_PROXY=1 in zerops.yml; see server.ts / resolve-public-get.ts
//      for the rationale.
//   2. Internal SSR proxies (the Astro frontend in apps/frontend) forward
//      X-Forwarded-For when calling rate-limited backend routes.
//      `apps/frontend/src/api/client.ts` (`forwardedForExtra` helper)
//      sets this for share / share-preview / artist-info; resolveTrack
//      forwards it directly.
// Either pre-condition failure produces the same symptom: every user
// shares a single bucket and a handful of cumulative requests trip the
// limit for everyone (user-visible as "Rate limit exceeded, retry in N
// seconds" after only 2-3 searches, or as silent 302 -> /404 redirects
// on the share-page SSR path).
//
// BFF bypass: even after both pre-conditions hold, 10 requests per 60
// seconds proved too tight for normal browsing because each share-page
// render consumes 3-4 sub-requests (share + share-preview x2 + artist-info). Internal
// SSR calls therefore SKIP the limiter when their X-API-Key matches
// INTERNAL_API_KEY (see `isInternalRequest` below). The global
// @fastify/rate-limit at 300/min still applies as a safety net against
// runaway BFF loops. External callers without the key go through the
// per-IP limiter unchanged.
//
// Both pre-conditions are instances of a wider recurring incident class:
// "an SSR proxy hides the real visitor IP from a downstream consumer". The
// same root has also broken Umami geo-analytics. See
// `docs/ssr-proxy-x-forwarded-for.md` for the full incident history and the
// checklist any new proxy must clear.
//
// Cleanup cadence is 5 minutes: aggressive enough that a burst of unique IPs
// does not bloat the Map for long, slack enough that cleanup itself is
// background noise on the event loop.
export const apiRateLimiter = new RateLimiter(10, 60_000);
const apiRateLimiterCleanupTimer = setInterval(() => apiRateLimiter.cleanup(), 5 * 60 * 1000);
apiRateLimiterCleanupTimer.unref();

// Per-client quota buckets for token-authenticated public-API requests
// (MC-088). Keyed by `api_clients.id`; the cap is the client's **effective**
// limit (per-key override ?? account tier ?? fallback, MC-100) passed on
// every check, so tier reassignments and admin edits take effect
// immediately. Enforced centrally in `authenticatePublic` (plugins/auth.ts)
// — token-authenticated requests skip the per-IP `apiRateLimiter` above
// (their identity is the client, not the IP; see the `request.apiClient`
// guard in resolve/cc-resolve/link routes).
// Same 5-minute cleanup cadence as the per-IP limiter.
export const clientMinuteRateLimiter = new DynamicRateLimiter(60_000);
export const clientDayRateLimiter = new DynamicRateLimiter(24 * 60 * 60 * 1000);
const clientRateLimiterCleanupTimer = setInterval(
  () => {
    clientMinuteRateLimiter.cleanup();
    clientDayRateLimiter.cleanup();
  },
  5 * 60 * 1000,
);
clientRateLimiterCleanupTimer.unref();

/**
 * Explicit local/test escape hatch for migration and compatibility test
 * suites that intentionally hit the same endpoint many times from one IP.
 * Production must leave this unset.
 */
export function isRateLimitDisabled(): boolean {
  return process.env.DISABLE_RATE_LIMIT === "true";
}

/**
 * Check whether a request comes from the internal Astro SSR proxy.
 *
 * The proxy attaches `X-API-Key: <INTERNAL_API_KEY>` (Zerops Secret) to
 * every backend call from `apps/frontend/src/api/client.ts`. Route
 * handlers that hit `apiRateLimiter` should call this and skip the
 * per-IP check on a true return — see comment block above for the
 * BFF-bypass rationale.
 *
 * If `INTERNAL_API_KEY` is unset (dev fallback in `plugins/auth.ts`
 * lets unauthenticated requests through with a warn log), this returns
 * false; the limiter still applies. Production must set the secret.
 */
export function isInternalRequest(request: FastifyRequest): boolean {
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (!internalApiKey) return false;
  return request.headers["x-api-key"] === internalApiKey;
}
