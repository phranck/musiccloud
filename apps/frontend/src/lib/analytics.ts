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
  | "live_example_clicked"
  | "layered_footer_clicked"
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
  deviceModel?: string | null;
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

interface UserAgentBrand {
  brand: string;
  version: string;
}

interface UserAgentDataLike {
  brands?: UserAgentBrand[];
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{
    architecture?: string;
    bitness?: string;
    fullVersionList?: UserAgentBrand[];
    mobile?: boolean;
    model?: string;
    platform?: string;
    platformVersion?: string;
  }>;
}

interface DeviceProfile {
  browserFamily: string;
  deviceClass: string;
  deviceModel: string | null;
  osFamily: string;
}

const SESSION_KEY = "mc:analytics:session";
const VISITOR_KEY = "mc:analytics:visitor";
const FLUSH_DELAY_MS = 1200;
const MAX_BATCH_SIZE = 20;

let queue: WebsiteAnalyticsEvent[] = [];
let flushTimer: number | null = null;
let deviceProfile: DeviceProfile | null = null;
let deviceProfilePromise: Promise<DeviceProfile> | null = null;

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

function userAgentData(): UserAgentDataLike | null {
  return ((navigator as Navigator & { userAgentData?: UserAgentDataLike }).userAgentData ??
    null) as UserAgentDataLike | null;
}

function brandBrowserFamily(brands: UserAgentBrand[] | undefined): string | null {
  const brandNames = (brands ?? []).map((brand) => brand.brand.toLowerCase());
  if (brandNames.some((brand) => brand.includes("edge"))) return "edge";
  if (brandNames.some((brand) => brand.includes("chrome"))) return "chrome";
  if (brandNames.some((brand) => brand.includes("chromium"))) return "chromium";
  if (brandNames.some((brand) => brand.includes("safari"))) return "safari";
  if (brandNames.some((brand) => brand.includes("firefox"))) return "firefox";
  return null;
}

function browserFamily(brands?: UserAgentBrand[]): string {
  const hinted = brandBrowserFamily(brands ?? userAgentData()?.brands);
  if (hinted) return hinted;

  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "edge";
  if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "safari";
  if (/Firefox\//.test(ua)) return "firefox";
  return "unknown";
}

function normalizePlatform(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "macos" || normalized === "mac os" || normalized === "macintel") return "macos";
  if (normalized === "ios" || normalized === "iphone" || normalized === "ipad") return "ios";
  if (normalized === "android") return "android";
  if (normalized === "windows" || normalized === "win32" || normalized === "win64") return "windows";
  if (normalized === "linux") return "linux";
  return normalized.slice(0, 64);
}

function osFamily(platform?: string): string {
  const hinted = normalizePlatform(platform ?? userAgentData()?.platform);
  if (hinted) return hinted;

  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Mac OS X/.test(ua)) return "macos";
  if (/Windows/.test(ua)) return "windows";
  if (/Linux/.test(ua)) return "linux";
  return "unknown";
}

function deviceClass(mobileHint?: boolean): string {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/.test(ua)) return "tablet";
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "tablet";
  if (/iPhone|iPod/.test(ua)) return "phone";
  if (/Android/.test(ua) && !/Mobile/.test(ua)) return "tablet";
  if (mobileHint === true || /Android.*Mobile/.test(ua)) return "phone";
  return "desktop";
}

function normalizeDeviceModel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || /^unknown$/i.test(trimmed)) return null;
  return trimmed.slice(0, 96);
}

function fallbackDeviceProfile(): DeviceProfile {
  const uaData = userAgentData();
  return {
    browserFamily: browserFamily(),
    deviceClass: deviceClass(uaData?.mobile),
    deviceModel: null,
    osFamily: osFamily(),
  };
}

/**
 * Best-effort device classification only. This deliberately uses browser-
 * exposed UA data and Client Hints, not fingerprinting probes such as canvas,
 * font, audio, plugin or WebGL entropy.
 */
function loadDeviceProfile(): Promise<DeviceProfile> {
  if (deviceProfile) return Promise.resolve(deviceProfile);
  if (deviceProfilePromise) return deviceProfilePromise;

  const fallback = fallbackDeviceProfile();
  const uaData = userAgentData();
  deviceProfilePromise = uaData?.getHighEntropyValues
    ? uaData
        .getHighEntropyValues(["model", "platform", "fullVersionList"])
        .then((hints) => ({
          browserFamily: browserFamily(hints.fullVersionList),
          deviceClass: deviceClass(hints.mobile ?? uaData.mobile),
          deviceModel: normalizeDeviceModel(hints.model),
          osFamily: osFamily(hints.platform),
        }))
        .catch(() => fallback)
    : Promise.resolve(fallback);

  return deviceProfilePromise.then((profile) => {
    deviceProfile = profile;
    return profile;
  });
}

function currentDeviceProfile(): DeviceProfile {
  return deviceProfile ?? fallbackDeviceProfile();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function baseEvent(eventType: WebsiteAnalyticsEventType): WebsiteAnalyticsEvent {
  const profile = currentDeviceProfile();
  return {
    occurredAt: new Date().toISOString(),
    eventType,
    path: window.location.pathname,
    routeTemplate: routeTemplate(),
    referrerDomain: safeDomain(document.referrer),
    deviceClass: profile.deviceClass,
    browserFamily: profile.browserFamily,
    osFamily: profile.osFamily,
    deviceModel: profile.deviceModel,
    shortId: currentShortId(),
    viewportBucket: viewportBucket(),
  };
}

function navigationType(): "back_forward" | "navigate" | "reload" {
  const entry = performance.getEntriesByType("navigation")[0];
  if (entry && "type" in entry) {
    const type = entry.type;
    if (type === "back_forward" || type === "reload") return type;
  }
  return "navigate";
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
  void loadDeviceProfile();
  void Promise.race([loadDeviceProfile(), delay(250)]).then(() => trackPageView());
  document.addEventListener("click", trackElementClick, { passive: true });
  window.addEventListener("pagehide", () => flush(true));
}

function trackElementClick(event: MouseEvent) {
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
    eventData: { label: target.dataset.analyticsLabel ?? target.ariaLabel ?? null },
  });
}

function trackPageView() {
  const type = navigationType();
  enqueue({
    ...baseEvent("page_view"),
    surface: "browser",
    elementKey: `browser.${type}`,
    eventData: { label: `browser_${type}`, navigation_type: type },
  });
}

export function trackSearchSubmitted(query: string, queryType: string, platform?: string | null) {
  enqueue({
    ...baseEvent("search_submitted"),
    platform: platform ?? null,
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

export function trackSelectedCandidateClick(candidateId: string) {
  enqueue({
    ...baseEvent("ui_click"),
    surface: "disambiguation",
    elementKey: "disambiguation.selected_candidate",
    eventData: { candidate_id: candidateId, label: "selected_candidate" },
  });
}

export function trackLiveExampleClick(shortId: string) {
  enqueue({
    ...baseEvent("live_example_clicked"),
    shortId,
    surface: "landing_example",
    elementKey: "landing.live_example",
    eventData: { suppressResolveAnalytics: true },
  });
}

export function trackLayeredFooterClick() {
  enqueue({
    ...baseEvent("layered_footer_clicked"),
    platform: "layered",
    surface: "footer",
    elementKey: "footer.layered",
  });
}

export function trackOverlayPanelGesture(slug: string, gesture: "drag" | "resize") {
  enqueue({
    ...baseEvent("ui_click"),
    surface: "overlay_panel",
    elementKey: `overlay.${gesture}`,
    eventData: { label: `overlay_${gesture}`, slug },
  });
}

export function trackContentSegmentClick({
  label,
  pageKind,
  segmentIndex,
  slug,
  surface,
}: {
  label: string;
  pageKind: "help" | "info" | null;
  segmentIndex: number;
  slug: string;
  surface: string;
}) {
  enqueue({
    ...baseEvent(pageKind === "help" ? "help_page_clicked" : pageKind === "info" ? "info_page_clicked" : "ui_click"),
    elementKey: `content.segment.${slug}.${segmentIndex}`,
    surface,
    eventData: {
      label,
      page_kind: pageKind,
      segment_index: segmentIndex,
      slug,
    },
  });
}

export function trackServiceLinkClick(service: string, label?: string | null) {
  trackUmami("service-link-click", { service });
  enqueue({
    ...baseEvent("listen_on_clicked"),
    platform: service,
    surface: "listen_on",
    elementKey: `listen_on.${service}`,
    eventData: { label: label ?? service },
  });
}

export function trackPopularTrackClick(position?: number, trackTitle?: string | null, artistName?: string | null) {
  const label = trackTitle && artistName ? `${trackTitle} - ${artistName}` : trackTitle;
  enqueue({
    ...baseEvent("popular_track_clicked"),
    surface: "popular_tracks",
    eventData: {
      artist_name: artistName ?? null,
      label: label ?? null,
      position: position ?? null,
      track_title: trackTitle ?? null,
    },
  });
}

export function trackSimilarArtistClick(position?: number, trackTitle?: string | null, artistName?: string | null) {
  const label = trackTitle && artistName ? `${trackTitle} - ${artistName}` : (artistName ?? trackTitle);
  enqueue({
    ...baseEvent("similar_artist_clicked"),
    surface: "similar_artists",
    eventData: {
      artist_name: artistName ?? null,
      label: label ?? null,
      position: position ?? null,
      track_title: trackTitle ?? null,
    },
  });
}

export function trackUpcomingEventClick(position: number, provider?: string | null, label?: string | null) {
  enqueue({
    ...baseEvent("upcoming_event_clicked"),
    surface: "upcoming_events",
    eventData: { label: label ?? null, position, provider: provider ?? null },
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

export function getContentPageKind(slug: string, label?: string | null): "help" | "info" | null {
  return contentPageKind(slug, label);
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
