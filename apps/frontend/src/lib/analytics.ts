import { ENDPOINTS } from "@musiccloud/shared";

type WebsiteAnalyticsEventType =
  | "page_view"
  | "search_submitted"
  | "resolve_started"
  | "resolve_succeeded"
  | "resolve_failed"
  | "listen_on_clicked"
  | "similar_artist_clicked"
  | "popular_track_clicked"
  | "upcoming_event_clicked"
  | "player_started"
  | "player_paused"
  | "player_resumed"
  | "player_completed"
  | "player_unavailable"
  | "info_page_clicked"
  | "help_page_clicked"
  | "ui_click";

type ViewportBucket = "mobile" | "tablet" | "desktop";

interface WebsiteAnalyticsEvent {
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
  viewportBucket?: ViewportBucket | null;
  eventData?: Record<string, string | number | boolean | null>;
}

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, data?: Record<string, string | number>) => void;
    };
    __musiccloudAnalyticsInitialized?: boolean;
  }
}

const SESSION_KEY = "mc:analytics:session";
const VISITOR_KEY = "mc:analytics:visitor";
const FLUSH_DELAY_MS = 1200;
const MAX_BATCH_SIZE = 20;

let queue: WebsiteAnalyticsEvent[] = [];
let flushTimer: number | null = null;

function trackingEnabled(): boolean {
  return ((import.meta.env.TRACKING_ENABLED as string | undefined) ?? "true") === "true";
}

function trackUmami(eventName: string, data?: Record<string, string | number>) {
  try {
    window.umami?.track(eventName, data);
  } catch {
    // Tracking must never break the app.
  }
}

function randomId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return Array.from(bytes, (byte, index) => {
    const hex = byte.toString(16).padStart(2, "0");
    return [4, 6, 8, 10].includes(index) ? `-${hex}` : hex;
  }).join("");
}

function getStoredId(storage: Storage, key: string): string {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const next = randomId();
  storage.setItem(key, next);
  return next;
}

function sessionId(): string {
  try {
    return getStoredId(window.sessionStorage, SESSION_KEY);
  } catch {
    return randomId();
  }
}

function visitorId(): string | null {
  try {
    return getStoredId(window.localStorage, VISITOR_KEY);
  } catch {
    return null;
  }
}

function routeTemplate(pathname = window.location.pathname): string {
  if (pathname === "/") return "/";
  if (/^\/api\//.test(pathname)) return "/api/*";
  if (/^\/content\/[^/]+$/.test(pathname)) return "/content/:slug";
  if (/^\/embed\/[^/]+$/.test(pathname)) return "/embed/:shortId";
  if (/^\/link\/[^/]+$/.test(pathname)) return "/link/:id";
  if (/^\/[^/]+$/.test(pathname)) return "/:shortId";
  return pathname;
}

function currentShortId(): string | null {
  const match = window.location.pathname.match(/^\/([^/]+)$/);
  return match?.[1] ?? null;
}

function viewportBucket(): ViewportBucket {
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1080) return "tablet";
  return "desktop";
}

function browserFamily(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "edge";
  if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "safari";
  if (/Firefox\//.test(ua)) return "firefox";
  return "unknown";
}

function osFamily(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Mac OS X/.test(ua)) return "macos";
  if (/Windows/.test(ua)) return "windows";
  if (/Linux/.test(ua)) return "linux";
  return "unknown";
}

function baseEvent(eventType: WebsiteAnalyticsEventType): WebsiteAnalyticsEvent {
  return {
    occurredAt: new Date().toISOString(),
    eventType,
    path: window.location.pathname,
    routeTemplate: routeTemplate(),
    referrerDomain: safeDomain(document.referrer),
    deviceClass: viewportBucket(),
    browserFamily: browserFamily(),
    osFamily: osFamily(),
    shortId: currentShortId(),
    viewportBucket: viewportBucket(),
  };
}

function safeDomain(value: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function send(events: WebsiteAnalyticsEvent[], useBeacon = false) {
  if (!trackingEnabled() || events.length === 0) return;
  const body = JSON.stringify({ sessionId: sessionId(), visitorId: visitorId(), events });

  if (useBeacon && navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(ENDPOINTS.frontend.analytics.websiteEvents, blob)) return;
  }

  fetch(ENDPOINTS.frontend.analytics.websiteEvents, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: useBeacon,
  }).catch(() => {});
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => flush(), FLUSH_DELAY_MS);
}

function flush(useBeacon = false) {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  const events = queue;
  queue = [];
  send(events, useBeacon);
}

function enqueue(event: WebsiteAnalyticsEvent) {
  if (!trackingEnabled() || typeof window === "undefined") return;
  queue.push(event);
  if (queue.length >= MAX_BATCH_SIZE) {
    flush();
    return;
  }
  scheduleFlush();
}

export function initWebsiteAnalytics() {
  if (typeof window === "undefined" || window.__musiccloudAnalyticsInitialized) return;
  window.__musiccloudAnalyticsInitialized = true;
  trackPageView();
  document.addEventListener("click", trackHeatmapClick, { passive: true });
  window.addEventListener("pagehide", () => flush(true));
}

function trackHeatmapClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-analytics-key]") : null;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  enqueue({
    ...baseEvent("ui_click"),
    surface: target.dataset.analyticsSurface ?? null,
    elementKey: target.dataset.analyticsKey ?? null,
    mediaType: target.dataset.analyticsMediaType ?? null,
    platform: target.dataset.analyticsPlatform ?? null,
    xPct: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
    yPct: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
  });
}

export function trackPageView() {
  enqueue(baseEvent("page_view"));
}

export function trackSearchSubmitted(query: string, queryType: string) {
  enqueue({
    ...baseEvent("search_submitted"),
    eventData: { query_normalized: query.trim().slice(0, 160), query_type: queryType },
  });
}

export function trackResolveStarted(platform: string | null, surface: string) {
  enqueue({ ...baseEvent("resolve_started"), platform, surface });
}

export function trackResolve(service: string, surface = "unknown") {
  trackUmami("track-resolve", { service });
  enqueue({ ...baseEvent("resolve_succeeded"), platform: service, surface });
}

export function trackResolveFailed(platform: string | null, surface: string, errorClass: string) {
  enqueue({ ...baseEvent("resolve_failed"), platform, surface, eventData: { error_class: errorClass } });
}

export function trackServiceLinkClick(service: string) {
  trackUmami("service-link-click", { service });
  enqueue({
    ...baseEvent("listen_on_clicked"),
    platform: service,
    surface: "listen_on",
    elementKey: `listen_on.${service}`,
  });
}

export function trackPopularTrackClick(position?: number) {
  enqueue({
    ...baseEvent("popular_track_clicked"),
    surface: "popular_tracks",
    eventData: { position: position ?? null },
  });
}

export function trackSimilarArtistClick(position?: number) {
  enqueue({
    ...baseEvent("similar_artist_clicked"),
    surface: "similar_artists",
    eventData: { position: position ?? null },
  });
}

export function trackUpcomingEventClick(position: number, provider?: string | null) {
  enqueue({
    ...baseEvent("upcoming_event_clicked"),
    surface: "upcoming_events",
    eventData: { position, provider: provider ?? null },
  });
}

export function trackPlayerEvent(
  eventType: Extract<WebsiteAnalyticsEventType, `player_${string}`>,
  shortId?: string | null,
) {
  enqueue({ ...baseEvent(eventType), shortId: shortId ?? currentShortId(), surface: "player" });
}

function contentPageKind(slug: string, label?: string | null): "help" | "info" | null {
  const haystack = `${slug} ${label ?? ""}`.toLowerCase();
  if (/\b(help|hilfe|support|faq)\b/.test(haystack)) return "help";
  if (/\b(info|about|ueber|uber|impressum|privacy|datenschutz)\b/.test(haystack)) return "info";
  return null;
}

export function trackContentPageClick({
  label,
  openMode,
  slug,
  surface,
}: {
  label?: string | null;
  openMode: "fullscreen" | "overlay" | "external";
  slug: string;
  surface: string;
}) {
  const kind = contentPageKind(slug, label);
  if (!kind) return;
  enqueue({
    ...baseEvent(kind === "help" ? "help_page_clicked" : "info_page_clicked"),
    elementKey: `content.${kind}.${slug}`,
    surface,
    eventData: {
      label: label ?? null,
      open_mode: openMode,
      page_kind: kind,
      slug,
    },
  });
}
