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
const EVENT_REPORT_LIMIT = 10;

type ManagedUmamiEventName = "track-resolve" | "service-link-click";

interface UmamiEventValueRow {
  value: string;
  total: number;
}

interface UmamiEventTotal {
  total: number;
}

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

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeEventValueRows(raw: unknown): UmamiEventValueRow[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (!isRecord(entry)) return null;

      const value = toText(entry.x ?? entry.value).trim();
      const total = toNumber(entry.y ?? entry.total);
      if (value === "" || total <= 0) return null;

      return { value, total };
    })
    .filter((row): row is UmamiEventValueRow => row !== null);
}

function extractEventPropertyTotal(raw: unknown, propertyName: string): number {
  if (!Array.isArray(raw)) return 0;

  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    if (toText(entry.propertyName) !== propertyName) continue;
    return toNumber(entry.total);
  }

  return 0;
}

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

function buildEventValuePath(eventName: ManagedUmamiEventName, propertyName: string, period: UmamiPeriod) {
  const { startAt, endAt } = periodToRange(period);
  const params = new URLSearchParams({
    startAt: String(startAt),
    endAt: String(endAt),
    event: eventName,
    propertyName,
    limit: String(EVENT_REPORT_LIMIT),
  });
  return `/websites/${UMAMI_WEBSITE_ID}/event-data/values?${params.toString()}`;
}

function buildEventPropertiesPath(eventName: ManagedUmamiEventName, period: UmamiPeriod) {
  const { startAt, endAt } = periodToRange(period);
  const params = new URLSearchParams({
    startAt: String(startAt),
    endAt: String(endAt),
    event: eventName,
  });
  return `/websites/${UMAMI_WEBSITE_ID}/event-data/events?${params.toString()}`;
}

async function getManagedUmamiEventValues(
  eventName: ManagedUmamiEventName,
  propertyName: string,
  periodRaw: string | undefined,
) {
  if (!umamiConfigured) return null;

  const period = normalizePeriod(periodRaw);

  try {
    const rawData = await umamiGet(buildEventValuePath(eventName, propertyName, period));
    return normalizeEventValueRows(rawData);
  } catch (error) {
    log.error("Umami", `event values request failed: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

async function getManagedUmamiEventTotal(
  eventName: ManagedUmamiEventName,
  propertyName: string,
  periodRaw: string | undefined,
): Promise<UmamiEventTotal | null> {
  if (!umamiConfigured) return null;

  const period = normalizePeriod(periodRaw);

  try {
    const rawData = await umamiGet(buildEventPropertiesPath(eventName, period));
    return { total: extractEventPropertyTotal(rawData, propertyName) };
  } catch (error) {
    log.error("Umami", `event total request failed: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
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

// --- musiccloud-specific event queries ---

export async function getManagedUmamiResolvesByService(periodRaw: string | undefined) {
  return getManagedUmamiEventValues("track-resolve", "service", periodRaw);
}

export async function getManagedUmamiResolveTotal(periodRaw: string | undefined) {
  return getManagedUmamiEventTotal("track-resolve", "service", periodRaw);
}

export async function getManagedUmamiLinkClicksByService(periodRaw: string | undefined) {
  return getManagedUmamiEventValues("service-link-click", "service", periodRaw);
}

export async function getManagedUmamiLinkClickTotal(periodRaw: string | undefined) {
  return getManagedUmamiEventTotal("service-link-click", "service", periodRaw);
}

export async function getManagedUmamiInteractionTotal(periodRaw: string | undefined) {
  if (!umamiConfigured) return null;

  try {
    const [resolves, linkClicks] = await Promise.all([
      getManagedUmamiEventTotal("track-resolve", "service", periodRaw),
      getManagedUmamiEventTotal("service-link-click", "service", periodRaw),
    ]);

    return {
      total: (resolves?.total ?? 0) + (linkClicks?.total ?? 0),
    };
  } catch (error) {
    log.error("Umami", `interaction total request failed: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}
