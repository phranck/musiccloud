import {
  ENDPOINTS,
  type Locale,
  type NavId,
  type NavItem,
  type PublicContentPage,
  type SharePageResponse,
} from "@musiccloud/shared";

const BACKEND_URL =
  (import.meta.env.BACKEND_URL as string | undefined) ?? process.env.BACKEND_URL ?? "http://localhost:4000";
const INTERNAL_API_KEY = (import.meta.env.INTERNAL_API_KEY as string | undefined) ?? process.env.INTERNAL_API_KEY ?? "";

function backendUrl(path: string): string {
  return `${BACKEND_URL}${path}`;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function internalHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(INTERNAL_API_KEY ? { "X-API-Key": INTERNAL_API_KEY } : {}),
    ...extra,
  };
}

/**
 * Build X-Forwarded-For extras for backend calls that hit per-IP rate
 * limits. Without this header the backend `apiRateLimiter` buckets by the
 * frontend pod IP, so all SSR-driven calls share one 10/min bucket
 * globally — see `apps/backend/src/lib/infra/rate-limiter.ts:67-72`. Pass
 * `Astro.clientAddress` (or the equivalent in API endpoints) so the
 * backend buckets per real user.
 */
function forwardedForExtra(clientIp: string | undefined): Record<string, string> | undefined {
  return clientIp ? { "X-Forwarded-For": clientIp } : undefined;
}

/** Refresh an expired Deezer preview URL for a share. Returns `{ previewUrl: null }`
 *  if no preview can be produced; returns `null` on transport failure so the
 *  client can distinguish "no preview" from "refresh failed, try again later". */
export async function fetchSharePreview(
  shortId: string,
  clientIp?: string,
): Promise<{ previewUrl: string | null } | null> {
  try {
    const res = await fetchWithTimeout(
      backendUrl(ENDPOINTS.v1.sharePreview(shortId)),
      { headers: internalHeaders(forwardedForExtra(clientIp)) },
      15000,
    );
    if (!res.ok) return null;
    return (await res.json()) as { previewUrl: string | null };
  } catch {
    return null;
  }
}

/** Fetch share page data (track or album) by shortId from the backend. */
export async function fetchShareData(shortId: string, clientIp?: string): Promise<SharePageResponse | null> {
  try {
    const res = await fetchWithTimeout(
      backendUrl(ENDPOINTS.v1.share(shortId)),
      { headers: internalHeaders(forwardedForExtra(clientIp)), cache: "no-store" },
      5000,
    );
    if (!res.ok) return null;
    return res.json() as Promise<SharePageResponse>;
  } catch {
    return null;
  }
}

/** Forward a resolve request to the backend. */
export async function resolveTrack(
  body: { query?: string; selectedCandidate?: string },
  clientIp?: string,
  origin?: string,
): Promise<Response> {
  const extra: Record<string, string> = {};
  if (clientIp) extra["X-Forwarded-For"] = clientIp;
  if (origin) extra.Origin = origin;
  return fetchWithTimeout(
    backendUrl(ENDPOINTS.v1.resolve),
    {
      method: "POST",
      headers: internalHeaders(Object.keys(extra).length > 0 ? extra : undefined),
      body: JSON.stringify(body),
    },
    15000,
  );
}

/** Check if website tracking (Umami) is enabled via environment variable. */
export function isTrackingEnabled(): boolean {
  const val = (import.meta.env.TRACKING_ENABLED as string | undefined) ?? process.env.TRACKING_ENABLED ?? "true";
  return val === "true";
}

/**
 * Fetch a procedurally generated genre artwork from the backend. Returns
 * the raw `Response` so the Astro proxy can stream the JPEG body straight
 * through to the browser with the upstream headers intact (Content-Type,
 * Cache-Control). Cold-path generation can take a few seconds, so the
 * timeout is generous — on a cache purge the browser kicks off ~250
 * parallel tile requests and Jimp-based rendering is CPU-bound, so
 * under contention a single tile can legitimately wait well past 15 s
 * for its turn on the event loop.
 */
export async function fetchGenreArtwork(genreKey: string): Promise<Response> {
  return fetchWithTimeout(backendUrl(ENDPOINTS.v1.genreArtwork(genreKey)), { headers: internalHeaders() }, 60000);
}

/** Fetch a random short ID from the backend for the landing page example teaser. */
export async function fetchRandomExample(): Promise<{ shortId: string } | null> {
  try {
    const res = await fetchWithTimeout(backendUrl(ENDPOINTS.v1.randomExample), { headers: internalHeaders() }, 3000);
    if (!res.ok) return null;
    return res.json() as Promise<{ shortId: string }>;
  } catch {
    return null;
  }
}

/** Fetch the public navigation items for header or footer. SSR-safe; returns [] on failure. */
export async function fetchNavigation(navId: NavId, locale: Locale = "en"): Promise<NavItem[]> {
  try {
    const url = `${backendUrl(ENDPOINTS.v1.nav(navId))}?locale=${locale}`;
    const res = await fetchWithTimeout(url, { headers: internalHeaders() }, 5000);
    if (!res.ok) return [];
    return (await res.json()) as NavItem[];
  } catch {
    return [];
  }
}

/** Fetch a single published content page by slug, with server-rendered HTML. */
export async function fetchPublicContentPage(
  slug: string,
  locale: Locale = "en",
  clientIp?: string,
): Promise<PublicContentPage | null> {
  try {
    const url = `${backendUrl(ENDPOINTS.v1.content.detail(slug))}?locale=${locale}`;
    const res = await fetchWithTimeout(url, { headers: internalHeaders(forwardedForExtra(clientIp)) }, 5000);
    if (!res.ok) return null;
    return (await res.json()) as PublicContentPage;
  } catch {
    return null;
  }
}

/**
 * Fetch artist-info aggregate (Spotify followers / Last.fm plays / similar
 * artists). Returns the raw `Response` so the Astro proxy at
 * `pages/api/artist-info.ts` can stream the JSON body straight through
 * with the upstream status. The backend route is rate-limited by the
 * shared `apiRateLimiter` bucket; passing `clientIp` keeps the bucket
 * per-user.
 */
export async function fetchArtistInfo(name: string, region: string | undefined, clientIp?: string): Promise<Response> {
  const params = new URLSearchParams({ name });
  if (region) params.set("region", region);
  return fetchWithTimeout(
    `${backendUrl(ENDPOINTS.v1.artistInfo)}?${params.toString()}`,
    { headers: internalHeaders(forwardedForExtra(clientIp)) },
    10000,
  );
}
