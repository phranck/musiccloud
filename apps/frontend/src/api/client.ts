import {
  DESIGN_TOKENS_DEFAULTS,
  type DesignTokens,
  ENDPOINTS,
  type Locale,
  type NavId,
  type NavItem,
  type PublicContentPage,
  parseDesignTokens,
  type SharePageResponse,
} from "@musiccloud/shared";

const BACKEND_URL: string = (() => {
  const value = (import.meta.env.BACKEND_URL as string | undefined)?.trim() || process.env.BACKEND_URL?.trim();
  if (!value) {
    throw new Error(
      "Missing BACKEND_URL. Set it in the runtime environment. .env.local is only for local development.",
    );
  }
  return value;
})();
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
 * frontend pod IP, so all SSR-driven calls share one 10 requests per
 * 60 seconds bucket globally — see `apps/backend/src/lib/infra/rate-limiter.ts:67-72`.
 * Pass `Astro.clientAddress` (or the equivalent in API endpoints) so the
 * backend buckets per real user.
 */
function forwardedForExtra(clientIp: string | undefined): Record<string, string> | undefined {
  return clientIp ? { "X-Forwarded-For": clientIp } : undefined;
}

const APPLE_MUSIC_STOREFRONT_FORWARD_HEADERS = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "cloudfront-viewer-country",
  "x-country-code",
  "x-geo-country",
] as const;

/**
 * Forward only the region signals needed for Apple Music storefront filtering.
 *
 * The backend share route cannot infer the viewer's Apple Music region from
 * an internal Astro SSR request unless the BFF forwards it. We intentionally
 * keep this allow-list tiny: Accept-Language helps local/dev and direct
 * browser traffic (`de-AT` -> `at`), while the country headers cover common
 * CDN/proxy deployments. Cookies, auth headers and arbitrary browser headers
 * must not be copied into backend-internal calls.
 */
function appleMusicStorefrontExtra(requestHeaders?: Headers): Record<string, string> | undefined {
  if (!requestHeaders) return undefined;

  const out: Record<string, string> = {};
  const acceptLanguage = requestHeaders.get("accept-language");
  if (acceptLanguage) out["Accept-Language"] = acceptLanguage;

  for (const name of APPLE_MUSIC_STOREFRONT_FORWARD_HEADERS) {
    const value = requestHeaders.get(name);
    if (value) out[name] = value;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function shareRequestExtra(
  clientIp: string | undefined,
  requestHeaders: Headers | undefined,
): Record<string, string> | undefined {
  const out = {
    ...(forwardedForExtra(clientIp) ?? {}),
    ...(appleMusicStorefrontExtra(requestHeaders) ?? {}),
  };

  return Object.keys(out).length > 0 ? out : undefined;
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
export async function fetchShareData(
  shortId: string,
  clientIp?: string,
  requestHeaders?: Headers,
): Promise<SharePageResponse | null> {
  try {
    const res = await fetchWithTimeout(
      backendUrl(ENDPOINTS.v1.share(shortId)),
      { headers: internalHeaders(shareRequestExtra(clientIp, requestHeaders)), cache: "no-store" },
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

/**
 * In-process TTL cache for the design tokens. The BFF has no cache layer and
 * `output: "server"` re-runs SSR on every request, so without this each render
 * would hit the backend's dedicated `max: 2` pool and share the
 * `apiRateLimiter` bucket (see {@link forwardedForExtra}). One fetch per TTL
 * window across all renders is plenty — tokens change only on an admin save.
 *
 * Dev: the TTL is 0 so a dashboard save shows on the very next reload, with no
 * server restart. Production keeps the 60s window for the pool/rate-limit budget.
 */
let designTokensCache: { tokens: DesignTokens; expiresAt: number } | null = null;
const DESIGN_TOKENS_TTL_MS = import.meta.env.DEV ? 0 : 60_000;

/**
 * Fetch the site's validated design tokens for SSR `:root` seeding. Cached
 * in-process for {@link DESIGN_TOKENS_TTL_MS}. The backend already validates the
 * blob, but the response is re-run through `parseDesignTokens` here (idempotent)
 * so every value emitted into the inline `<style>` is guaranteed
 * CSS-injection-safe regardless of transport. Falls back to the last good cache,
 * then to the canonical defaults, on any error — SSR never throws on this path.
 */
export async function fetchDesignTokens(): Promise<DesignTokens> {
  const now = Date.now();
  if (designTokensCache && designTokensCache.expiresAt > now) return designTokensCache.tokens;
  try {
    const res = await fetchWithTimeout(
      backendUrl(ENDPOINTS.v1.siteSettings.designTokens),
      { headers: internalHeaders() },
      5000,
    );
    if (!res.ok) throw new Error(`design-tokens responded ${res.status}`);
    const { tokens } = parseDesignTokens(await res.json());
    designTokensCache = { tokens, expiresAt: now + DESIGN_TOKENS_TTL_MS };
    return tokens;
  } catch {
    const tokens = designTokensCache?.tokens ?? DESIGN_TOKENS_DEFAULTS;
    // Cache the fallback for the TTL too so a backend blip doesn't re-hit every render.
    designTokensCache = { tokens, expiresAt: now + DESIGN_TOKENS_TTL_MS };
    return tokens;
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
 * Fetch artist-info aggregate (multi-source fan count / Last.fm plays / similar
 * artists). Returns the raw `Response` so the Astro proxy at
 * `pages/api/artist-info.ts` can stream the JSON body straight through
 * with the upstream status. The backend route is rate-limited by the
 * shared `apiRateLimiter` bucket; passing `clientIp` keeps the bucket
 * per-user.
 */
export async function fetchArtistInfo(
  name: string,
  region: string | undefined,
  clientIp?: string,
  context?: { shortId?: string; artistEntityId?: string; refresh?: "profile" },
): Promise<Response> {
  const params = new URLSearchParams({ name });
  if (region) params.set("region", region);
  if (context?.shortId) params.set("shortId", context.shortId);
  if (context?.artistEntityId) params.set("artistEntityId", context.artistEntityId);
  if (context?.refresh) params.set("refresh", context.refresh);
  return fetchWithTimeout(
    `${backendUrl(ENDPOINTS.v1.artistInfo)}?${params.toString()}`,
    { headers: internalHeaders(forwardedForExtra(clientIp)) },
    10000,
  );
}
