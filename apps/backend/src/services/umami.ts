/**
 * @file Low-level client for the managed Umami analytics instance.
 *
 * Provides a single typed `umamiGet<T>()` helper plus shared normalization
 * utilities used by the admin-facing wrappers in `admin-umami.ts`. This
 * file deliberately knows nothing about which endpoints the dashboard
 * consumes; it just handles auth, retries, and response-shape tolerance.
 *
 * ## Token management
 *
 * Umami requires username/password login to mint a bearer token. Tokens
 * are valid for 24 hours on the server side, but this client caches them
 * for only 23 hours. The one-hour safety margin covers clock drift
 * between the backend and the Umami server and soft-expires the token
 * before the server starts rejecting it, so no request ever wastes a
 * round-trip on a just-expired token.
 *
 * ## Promise coalescing on token refresh
 *
 * Concurrent callers that find the cache empty all wait on the same
 * in-flight `fetchToken()` promise instead of firing parallel login
 * requests. This matches the project rule for token refresh ("prevent
 * parallel requests from each fetching a new token independently") and
 * keeps the login rate on Umami low under burst load.
 *
 * ## 401 retry once
 *
 * If Umami returns 401 despite our cached token being "fresh", the
 * cached value is cleared and the request is retried once. This covers
 * the case where the server revoked the token early (e.g. after a
 * restart or a credential change). The retry is explicitly capped at
 * one iteration via the `retried` flag so a genuinely bad credential
 * cannot cause an infinite loop.
 *
 * ## Two response shapes in `normalizeUmamiStats`
 *
 * Umami has changed the `/stats` response format across releases.
 * Newer versions return numeric top-level fields plus a `comparison`
 * sibling object; older versions return nested `{ value, prev, change }`
 * objects per field. `getMetricFromCurrentShape` and
 * `getMetricFromLegacyShape` handle the two shapes so the dashboard
 * sees one consistent `NormalizedUmamiStats` regardless of which Umami
 * version sits on the other end.
 */
import { log } from "../lib/infra/logger.js";

const UMAMI_URL = process.env.UMAMI_URL ?? "";
const UMAMI_USERNAME = process.env.UMAMI_USERNAME ?? "";
const UMAMI_PASSWORD = process.env.UMAMI_PASSWORD ?? "";

export const UMAMI_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID ?? "";

export const umamiConfigured =
  UMAMI_URL !== "" && UMAMI_USERNAME !== "" && UMAMI_PASSWORD !== "" && UMAMI_WEBSITE_ID !== "";

let cachedToken: { token: string; expiresAt: number } | null = null;
let tokenPromise: Promise<string> | null = null;

/**
 * Performs the username/password login against Umami and caches the
 * resulting token. Not for direct callers: they should go through
 * `getToken`, which handles caching and coalescing.
 *
 * @returns the fresh bearer token
 * @throws when Umami returns a non-OK status for the login request
 */
async function fetchToken(): Promise<string> {
  const res = await fetch(`${UMAMI_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: UMAMI_USERNAME, password: UMAMI_PASSWORD }),
  });

  if (!res.ok) throw new Error(`Umami auth failed: ${res.status}`);

  const { token } = (await res.json()) as { token: string };
  // Cache for 23h (tokens are valid for 24h by default)
  cachedToken = { token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
  return token;
}

/**
 * Returns a valid bearer token, either from cache or by coalescing on
 * the in-flight `fetchToken` promise shared across concurrent callers.
 *
 * @returns a bearer token that was valid at the moment it was handed out
 */
async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  if (tokenPromise) return tokenPromise;
  tokenPromise = fetchToken().finally(() => {
    tokenPromise = null;
  });
  return tokenPromise;
}

/**
 * Authenticated GET against the Umami API. Handles token attachment and
 * one layer of 401 retry transparently, so callers can request a path
 * without worrying about auth lifecycle.
 *
 * @param path    - path below `${UMAMI_URL}/api`, leading slash required
 * @param retried - internal flag used by the 401 retry branch; callers should leave this default
 * @returns the JSON body parsed as `T`
 * @throws when Umami returns a non-OK status (after the one 401 retry)
 */
export async function umamiGet<T>(path: string, retried = false): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${UMAMI_URL}/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && !retried) {
    cachedToken = null;
    return umamiGet<T>(path, true);
  }
  if (!res.ok) throw new Error(`Umami request failed: ${res.status} ${path}`);
  return res.json() as Promise<T>;
}

export type UmamiPeriod = "today" | "7d" | "30d" | "60d" | "90d";

const PERIOD_DAYS: Record<UmamiPeriod, number | null> = {
  today: null,
  "7d": 7,
  "30d": 30,
  "60d": 60,
  "90d": 90,
};

/**
 * Converts a dashboard period label to the concrete
 * `{ startAt, endAt }` window Umami expects on its query APIs.
 *
 * `today` is treated specially: the window starts at local midnight
 * rather than 24 hours ago, so the "today" tile shows stats since
 * 00:00 instead of a rolling window that drifts through the day.
 * Longer periods snap their start to midnight as well, which keeps
 * result sets stable within the same day (two refreshes five
 * minutes apart should not shift the X axis).
 *
 * @param period - dashboard-facing period label
 * @returns epoch millisecond bounds `{ startAt, endAt }`
 */
export function periodToRange(period: UmamiPeriod): { startAt: number; endAt: number } {
  const endAt = Date.now();

  if (period === "today") {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return { startAt: midnight.getTime(), endAt };
  }

  const days = PERIOD_DAYS[period] ?? 7;
  const startAt = new Date();
  startAt.setDate(startAt.getDate() - days);
  startAt.setHours(0, 0, 0, 0);
  return { startAt: startAt.getTime(), endAt };
}

type UmamiKpiMetric = {
  value: number;
  change: number;
};

type NormalizedUmamiStats = {
  pageviews: UmamiKpiMetric;
  visitors: UmamiKpiMetric;
  visits: UmamiKpiMetric;
  bounces: UmamiKpiMetric;
  totaltime: UmamiKpiMetric;
};

type MetricField = keyof NormalizedUmamiStats;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toChange(current: number, previous: number): number {
  if (previous <= 0) return 0;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function getMetricValue(metric: unknown): number {
  if (isRecord(metric)) {
    return toNumber(metric.value);
  }
  return toNumber(metric);
}

function getMetricFromLegacyShape(source: Record<string, unknown>, field: MetricField): UmamiKpiMetric {
  const metric = source[field];
  if (!isRecord(metric)) return { value: 0, change: 0 };
  const value = toNumber(metric.value);
  const explicitChange = toNumber(metric.change);
  if (explicitChange !== 0) return { value, change: explicitChange };
  const prev = toNumber(metric.prev);
  return { value, change: toChange(value, prev) };
}

function getMetricFromCurrentShape(
  source: Record<string, unknown>,
  comparison: Record<string, unknown>,
  field: MetricField,
): UmamiKpiMetric {
  const value = getMetricValue(source[field]);
  const previous = getMetricValue(comparison[field]);
  return { value, change: toChange(value, previous) };
}

/**
 * Flattens either Umami response shape into the normalized structure
 * the dashboard consumes. Detects the current shape via the top-level
 * `pageviews` type: numeric means the newer flat-plus-comparison shape,
 * object means the legacy nested shape.
 *
 * Non-record input (e.g. Umami error body, null) yields a fully-zeroed
 * stats object so the dashboard can render a "no data" state without
 * crashing. See the file header for the two-shape motivation.
 *
 * @param raw - parsed Umami `/stats` response, untrusted shape
 * @returns a consistent `NormalizedUmamiStats` with `value` and `change` per metric
 */
export function normalizeUmamiStats(raw: unknown): NormalizedUmamiStats {
  if (!isRecord(raw)) {
    return {
      pageviews: { value: 0, change: 0 },
      visitors: { value: 0, change: 0 },
      visits: { value: 0, change: 0 },
      bounces: { value: 0, change: 0 },
      totaltime: { value: 0, change: 0 },
    };
  }

  const comparison = isRecord(raw.comparison) ? raw.comparison : {};
  const hasCurrentShape = typeof raw.pageviews === "number";

  return {
    pageviews: hasCurrentShape
      ? getMetricFromCurrentShape(raw, comparison, "pageviews")
      : getMetricFromLegacyShape(raw, "pageviews"),
    visitors: hasCurrentShape
      ? getMetricFromCurrentShape(raw, comparison, "visitors")
      : getMetricFromLegacyShape(raw, "visitors"),
    visits: hasCurrentShape
      ? getMetricFromCurrentShape(raw, comparison, "visits")
      : getMetricFromLegacyShape(raw, "visits"),
    bounces: hasCurrentShape
      ? getMetricFromCurrentShape(raw, comparison, "bounces")
      : getMetricFromLegacyShape(raw, "bounces"),
    totaltime: hasCurrentShape
      ? getMetricFromCurrentShape(raw, comparison, "totaltime")
      : getMetricFromLegacyShape(raw, "totaltime"),
  };
}

/**
 * Translates dashboard-facing metric names to what Umami's `/metrics`
 * API actually wants. The dashboard speaks `url`, Umami expects `path`;
 * all other values pass through unchanged.
 */
const METRIC_TYPE_MAP: Record<string, string> = {
  url: "path",
};

/**
 * @param type - dashboard metric type (e.g. `url`, `referrer`, `country`)
 * @returns the Umami-native type name to send on the `type=` query param
 */
export function normalizeUmamiMetricType(type: string): string {
  return METRIC_TYPE_MAP[type] ?? type;
}

if (umamiConfigured) {
  log.debug("Umami", "Analytics proxy configured");
} else {
  log.error("Umami", "Analytics not configured (missing UMAMI_* env vars)");
}
