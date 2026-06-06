/**
 * @file Admin-facing Umami queries, built on top of `umami.ts`.
 *
 * Exposes the function surface consumed by `routes/admin-analytics.ts`.
 * Every public function follows the same contract:
 *
 * - Returns `null` when Umami is not configured (`umamiConfigured === false`).
 * - Returns `null` when the underlying call throws (error is logged).
 * - Otherwise returns the shaped payload the dashboard expects.
 *
 * This "null on any failure" pattern is what lets the admin route
 * render a "no data" state instead of propagating errors to the client
 * when Umami is down or deliberately unconfigured (e.g. local dev).
 *
 */
import { log } from "../lib/infra/logger.js";
import {
  normalizeUmamiMetricType,
  normalizeUmamiStats,
  periodToRange,
  UMAMI_WEBSITE_ID,
  type UmamiPeriod,
  umamiConfigured,
  umamiGet,
} from "./umami.js";

const DEFAULT_PERIOD: UmamiPeriod = "7d";

/**
 * Whitelists the incoming query-string period to a known `UmamiPeriod`.
 * Anything else (including `undefined` and malicious values) falls back
 * to `7d`, which keeps the API honest and prevents unknown period
 * strings from bleeding through to Umami.
 *
 * @param period - raw `period` query param as received on the wire
 * @returns a valid `UmamiPeriod` value
 */
export function normalizePeriod(period: string | undefined): UmamiPeriod {
  switch (period) {
    case "today":
    case "7d":
    case "30d":
    case "60d":
    case "90d":
      return period;
    default:
      return DEFAULT_PERIOD;
  }
}

export async function getManagedUmamiStats(periodRaw: string | undefined) {
  if (!umamiConfigured) return null;

  const period = normalizePeriod(periodRaw);
  const { startAt, endAt } = periodToRange(period);

  try {
    const rawData = await umamiGet(`/websites/${UMAMI_WEBSITE_ID}/stats?startAt=${startAt}&endAt=${endAt}`);
    return normalizeUmamiStats(rawData);
  } catch (error) {
    log.error("Umami", `stats request failed: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

export async function getManagedUmamiPageviews(periodRaw: string | undefined) {
  if (!umamiConfigured) return null;

  const period = normalizePeriod(periodRaw);
  const { startAt, endAt } = periodToRange(period);
  const unit = period === "today" ? "hour" : "day";

  try {
    return await umamiGet(`/websites/${UMAMI_WEBSITE_ID}/pageviews?startAt=${startAt}&endAt=${endAt}&unit=${unit}`);
  } catch (error) {
    log.error("Umami", `pageviews request failed: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

export async function getManagedUmamiMetrics(typeRaw: string | undefined, periodRaw: string | undefined) {
  if (!umamiConfigured) return null;

  const period = normalizePeriod(periodRaw);
  const type = normalizeUmamiMetricType(typeRaw ?? "url");
  const { startAt, endAt } = periodToRange(period);

  try {
    return await umamiGet(
      `/websites/${UMAMI_WEBSITE_ID}/metrics?type=${type}&startAt=${startAt}&endAt=${endAt}&limit=10`,
    );
  } catch (error) {
    log.error("Umami", `metrics request failed: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

export async function getManagedUmamiActive() {
  if (!umamiConfigured) return null;

  try {
    return await umamiGet(`/websites/${UMAMI_WEBSITE_ID}/active`);
  } catch (error) {
    log.error("Umami", `active request failed: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

export async function getManagedUmamiRealtime() {
  if (!umamiConfigured) return null;

  try {
    return await umamiGet(`/realtime/${UMAMI_WEBSITE_ID}`);
  } catch (error) {
    log.error("Umami", `realtime request failed: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}
