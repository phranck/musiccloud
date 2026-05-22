import { createHmac, randomUUID } from "node:crypto";
import net from "node:net";
import { getRepository } from "../db/index.js";
import type {
  WebsiteAnalyticsBatchInput,
  WebsiteAnalyticsConfidence,
  WebsiteAnalyticsEventInput,
  WebsiteAnalyticsEventType,
} from "../db/repository.js";

const MAX_EVENTS_PER_BATCH = 50;
const MAX_TEXT_LEN = 512;
const MAX_EVENT_DATA_JSON_LEN = 4_000;
const ANALYTICS_SECRET_ENV = "WEBSITE_ANALYTICS_HMAC_SECRET";
const FORBIDDEN_EVENT_DATA_KEY =
  /^(ip|ipAddress|userAgent|authorization|cookie|headers?|fingerprint|canvas|fonts?|plugins?|audio|hardware)$/i;

export const WEBSITE_ANALYTICS_EVENT_TYPES = [
  "page_view",
  "search_submitted",
  "resolve_started",
  "resolve_succeeded",
  "resolve_failed",
  "listen_on_clicked",
  "similar_artist_clicked",
  "popular_track_clicked",
  "upcoming_event_clicked",
  "player_started",
  "player_paused",
  "player_resumed",
  "player_completed",
  "player_unavailable",
  "info_page_clicked",
  "help_page_clicked",
  "live_example_clicked",
  "ui_click",
] as const satisfies readonly WebsiteAnalyticsEventType[];

export interface WebsiteAnalyticsEventRequest {
  id?: string;
  occurredAt: string;
  eventType: WebsiteAnalyticsEventType;
  path?: string | null;
  routeTemplate?: string | null;
  referrerDomain?: string | null;
  deviceClass?: string | null;
  browserFamily?: string | null;
  osFamily?: string | null;
  platform?: string | null;
  mediaType?: string | null;
  shortId?: string | null;
  surface?: string | null;
  elementKey?: string | null;
  xPct?: number | null;
  yPct?: number | null;
  viewportBucket?: "mobile" | "tablet" | "desktop" | null;
  eventData?: Record<string, unknown> | null;
}

export interface WebsiteAnalyticsBatchRequest {
  sessionId: string;
  visitorId?: string | null;
  events: WebsiteAnalyticsEventRequest[];
}

export interface WebsiteAnalyticsRequestContext {
  ip: string;
}

export class WebsiteAnalyticsConfigError extends Error {}

function getAnalyticsSecret(): string {
  const secret = process.env[ANALYTICS_SECRET_ENV];
  if (!secret) {
    throw new WebsiteAnalyticsConfigError(`${ANALYTICS_SECRET_ENV} is required for website analytics ingestion`);
  }
  return secret;
}

function hmacKey(secret: string, namespace: string, value: string): string {
  return createHmac("sha256", secret).update(`${namespace}:${value}`).digest("hex");
}

function utcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function expandIpv6(rawIp: string): string[] | null {
  const ip = rawIp.split("%", 1)[0]?.toLowerCase();
  if (!ip) return null;

  const parts = ip.split("::");
  if (parts.length > 2) return null;

  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts[1] ? parts[1].split(":") : [];
  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;

  const hextets = [...head, ...Array.from({ length: fill }, () => "0"), ...tail];
  if (hextets.length !== 8 || hextets.some((part) => !/^[0-9a-f]{0,4}$/.test(part))) {
    return null;
  }
  return hextets.map((part) => part.padStart(4, "0"));
}

function ipPrefix(rawIp: string): string {
  if (net.isIPv4(rawIp)) {
    const octets = rawIp.split(".");
    return `v4:${octets.slice(0, 3).join(".")}.0/24`;
  }

  if (rawIp.startsWith("::ffff:")) {
    const mapped = rawIp.slice("::ffff:".length);
    if (net.isIPv4(mapped)) {
      const octets = mapped.split(".");
      return `v4:${octets.slice(0, 3).join(".")}.0/24`;
    }
  }

  if (net.isIPv6(rawIp)) {
    const hextets = expandIpv6(rawIp);
    if (hextets) {
      return `v6:${hextets.slice(0, 3).join(":")}::/48`;
    }
  }

  return "unknown";
}

/**
 * Privacy boundary for website analytics.
 *
 * Raw IP addresses are used only inside this request-scoped function and are
 * never persisted. The returned key is a server-side HMAC over a truncated IP
 * prefix and a daily rotating period. This is pseudonymisation, not
 * anonymisation. Do not replace this with plain SHA hashing and do not add
 * browser fingerprinting signals such as canvas, fonts, plugins or audio
 * probes.
 */
export function deriveNetworkClusterKey(rawIp: string, occurredAt: Date, secret: string): string {
  return `wnc_${hmacKey(secret, "network-cluster", `${utcDay(occurredAt)}:${ipPrefix(rawIp)}`).slice(0, 40)}`;
}

export function deriveDeviceKey(visitorId: string, secret: string): string {
  return `wdev_${hmacKey(secret, "device", visitorId.trim()).slice(0, 40)}`;
}

function trimText(value: string | null | undefined, max = MAX_TEXT_LEN): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function sanitizeEventData(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const sanitized: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (FORBIDDEN_EVENT_DATA_KEY.test(key)) continue;
    if (raw === null || typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
      sanitized[key] = typeof raw === "string" ? trimText(raw, MAX_TEXT_LEN) : raw;
    }
  }

  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= MAX_EVENT_DATA_JSON_LEN) return sanitized;
  return { truncated: true };
}

function parseOccurredAt(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid occurredAt");
  }
  return parsed;
}

function toConfidence(deviceKey: string | null): WebsiteAnalyticsConfidence {
  return deviceKey ? "medium" : "low";
}

export async function ingestWebsiteAnalyticsBatch(
  payload: WebsiteAnalyticsBatchRequest,
  context: WebsiteAnalyticsRequestContext,
): Promise<{ accepted: number }> {
  if (!payload.events.length || payload.events.length > MAX_EVENTS_PER_BATCH) {
    throw new Error(`events must contain 1-${MAX_EVENTS_PER_BATCH} items`);
  }

  const secret = getAnalyticsSecret();
  const deviceKey = payload.visitorId ? deriveDeviceKey(payload.visitorId, secret) : null;
  const confidence = toConfidence(deviceKey);
  const events: WebsiteAnalyticsEventInput[] = payload.events.map((event) => {
    const occurredAt = parseOccurredAt(event.occurredAt);
    return {
      id: event.id ?? randomUUID(),
      occurredAt,
      eventType: event.eventType,
      sessionId: payload.sessionId,
      deviceKey,
      networkClusterKey: deriveNetworkClusterKey(context.ip, occurredAt, secret),
      confidence,
      path: trimText(event.path),
      routeTemplate: trimText(event.routeTemplate, 128),
      referrerDomain: trimText(event.referrerDomain, 255),
      deviceClass: trimText(event.deviceClass, 32),
      browserFamily: trimText(event.browserFamily, 64),
      osFamily: trimText(event.osFamily, 64),
      platform: trimText(event.platform, 64),
      mediaType: trimText(event.mediaType, 32),
      shortId: trimText(event.shortId, 64),
      surface: trimText(event.surface, 64),
      elementKey: trimText(event.elementKey, 128),
      xPct: event.xPct ?? null,
      yPct: event.yPct ?? null,
      viewportBucket: event.viewportBucket ?? null,
      eventData: sanitizeEventData(event.eventData),
    };
  });

  const firstEvent = events.reduce((earliest, event) => (event.occurredAt < earliest.occurredAt ? event : earliest));
  const lastEvent = events.reduce((latest, event) => (event.occurredAt > latest.occurredAt ? event : latest));
  const batch: WebsiteAnalyticsBatchInput = {
    session: {
      id: payload.sessionId,
      firstSeenAt: firstEvent.occurredAt,
      lastSeenAt: lastEvent.occurredAt,
      deviceKey,
      networkClusterKey: lastEvent.networkClusterKey,
      confidence,
      entryPath: firstEvent.path,
      exitPath: lastEvent.path,
    },
    events,
  };

  const repo = await getRepository();
  const accepted = await repo.insertWebsiteAnalyticsBatch(batch);
  return { accepted };
}
