import {
  type ApiErrorResponse,
  DESIGN_TOKENS_DEFAULTS,
  type DesignTokens,
  ENDPOINTS,
  type JamendoAudioFormat,
  type Locale,
  type NavId,
  type NavItem,
  type PublicContentPage,
  parseDesignTokens,
  type SharePageResponse,
} from "@musiccloud/shared";

export type BackendFetchResult<T> =
  | { kind: "success"; data: T }
  | { kind: "not-found"; error: ApiErrorResponse; statusCode: 404 }
  | { kind: "error"; error: ApiErrorResponse; statusCode: number };

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
 *
 * This is the canonical helper for a project-wide rule: any SSR proxy or
 * fetch that re-issues a request must forward the visitor IP, or downstream
 * IP consumers (rate limiter, analytics geo, …) see the pod IP. See
 * `docs/ssr-proxy-x-forwarded-for.md`.
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

/** Stream a CC track's audio from the backend `ccAudio` proxy. Returns the raw
 *  upstream Response (status + headers + body stream) so the Astro handler can
 *  relay it same-origin, passing the visitor's `Range` header through for seeks.
 *  An optional `format` selects the Jamendo delivery format; omitted lets the
 *  backend apply its default. No timeout — audio streams are long-lived. */
export async function fetchCcAudio(
  jamendoId: string,
  range: string | null,
  clientIp?: string,
  format?: JamendoAudioFormat,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(INTERNAL_API_KEY ? { "X-API-Key": INTERNAL_API_KEY } : {}),
    ...(range ? { Range: range } : {}),
    ...(clientIp ? { "X-Forwarded-For": clientIp } : {}),
  };
  return fetch(backendUrl(ENDPOINTS.v1.ccAudio(jamendoId, format)), { headers });
}

/** Fetch a CC track's audio from the backend `ccDownload` proxy as a named
 *  attachment. Returns the raw upstream Response so the Astro handler can relay
 *  the body + `Content-Disposition` / `Content-Type` headers same-origin. An
 *  optional `format` selects the Jamendo delivery format. */
export async function fetchCcDownload(
  jamendoId: string,
  clientIp?: string,
  format?: JamendoAudioFormat,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(INTERNAL_API_KEY ? { "X-API-Key": INTERNAL_API_KEY } : {}),
    ...(clientIp ? { "X-Forwarded-For": clientIp } : {}),
  };
  return fetch(backendUrl(ENDPOINTS.v1.ccDownload(jamendoId, format)), { headers });
}

/** Fetch share page data (track or album) by shortId from the backend. */
export async function fetchShareData(
  shortId: string,
  clientIp?: string,
  requestHeaders?: Headers,
): Promise<BackendFetchResult<SharePageResponse>> {
  try {
    const res = await fetchWithTimeout(
      backendUrl(ENDPOINTS.v1.share(shortId)),
      { headers: internalHeaders(shareRequestExtra(clientIp, requestHeaders)), cache: "no-store" },
      // CC shares are mirrored live from Jamendo (several throttled API calls per
      // open), so their SSR routinely takes a few seconds — well past a 5s budget
      // under any Jamendo latency. The caller turns a null into a /404 redirect,
      // so a too-tight timeout shows a spurious "not found" for a valid CC track.
      // Commercial shares resolve from the DB in ~20ms, so the wider budget never
      // bites them.
      20000,
    );
    if (!res.ok) return backendFailureResult(res);
    return { kind: "success", data: (await res.json()) as SharePageResponse };
  } catch (error) {
    return transportFailureResult(error);
  }
}

async function backendFailureResult(response: Response): Promise<BackendFetchResult<never>> {
  const payload = (await response.json().catch(() => null)) as Partial<ApiErrorResponse> | null;
  const fallbackCode = response.status === 404 ? "MC-RES-0003" : "MC-SYS-0001";
  const fallbackMessage =
    response.status === 404
      ? "The requested resource was not found. (MC-RES-0003)"
      : "An unexpected server error occurred. (MC-SYS-0001)";
  const error: ApiErrorResponse = {
    error: typeof payload?.error === "string" ? payload.error : fallbackCode,
    errorId: typeof payload?.errorId === "string" && payload.errorId ? payload.errorId : crypto.randomUUID(),
    message: typeof payload?.message === "string" ? payload.message : fallbackMessage,
    ...(payload?.context ? { context: payload.context } : {}),
  };

  return response.status === 404
    ? { kind: "not-found", error, statusCode: 404 }
    : { kind: "error", error, statusCode: response.status };
}

function transportFailureResult(error: unknown): BackendFetchResult<never> {
  const timedOut = error instanceof Error && error.name === "AbortError";
  const code = timedOut ? "MC-API-0005" : "MC-SYS-0002";
  const message = timedOut
    ? "The backend request timed out. (MC-API-0005)"
    : "The backend could not be reached. (MC-SYS-0002)";
  return {
    kind: "error",
    statusCode: timedOut ? 504 : 503,
    error: { error: code, errorId: crypto.randomUUID(), message },
  };
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
 * Forward a Creative Commons resolve request to the backend CC resolve endpoint.
 *
 * Exact clone of {@link resolveTrack} but targets `ENDPOINTS.v1.ccResolve`
 * (`/api/v1/cc/resolve`). Separated so the CC and commercial resolve paths
 * are independently typeable and do not accidentally cross-call each other
 * when the mode-aware hook switches endpoints.
 *
 * @param body - Resolve payload: either a free-text `query` or a
 *   `selectedCandidate` short-ID picked from a disambiguation list.
 * @param clientIp - The real visitor IP forwarded as `X-Forwarded-For` so
 *   the backend rate-limiter buckets per user rather than per frontend pod.
 *   Pass `Astro.clientAddress` from the proxy handler.
 * @param origin - The `Origin` header from the incoming browser request,
 *   forwarded for CORS audit on the backend side.
 * @returns The raw `Response` from the backend. The caller (Astro proxy) is
 *   responsible for streaming the body and propagating status / headers.
 */
export async function resolveCcTrack(
  body: { query?: string; selectedCandidate?: string },
  clientIp?: string,
  origin?: string,
): Promise<Response> {
  const extra: Record<string, string> = {};
  if (clientIp) extra["X-Forwarded-For"] = clientIp;
  if (origin) extra.Origin = origin;
  return fetchWithTimeout(
    backendUrl(ENDPOINTS.v1.ccResolve),
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

/**
 * Fetch a stored email image asset's bytes from the backend by id (MC-079).
 *
 * The backend is not publicly exposed; every backend route reachable from the
 * public domain is proxied by an Astro route (see
 * `pages/api/admin/email-assets/[id].ts`). Sent emails embed
 * `${PUBLIC_URL}/api/admin/email-assets/:id` as absolute image URLs, so the
 * public domain must serve those bytes — this is the fetcher behind that
 * proxy. Returns the raw `Response` so the proxy can stream the image body
 * through with the upstream headers (Content-Type, immutable Cache-Control)
 * intact.
 *
 * @param id - the `email_assets.id` to fetch.
 * @returns the raw upstream `Response`.
 */
export async function fetchEmailAsset(id: string): Promise<Response> {
  return fetchWithTimeout(backendUrl(ENDPOINTS.admin.emailAssets.detail(id)), { headers: internalHeaders() }, 15000);
}

/**
 * Fetch a procedurally generated Creative-Commons genre artwork from the
 * backend. Clone of {@link fetchGenreArtwork} targeting the CC route
 * (`ENDPOINTS.v1.ccGenreArtwork`), whose cover is Jamendo-sourced so the CC
 * path never touches Last.fm. Returns the raw `Response` so the Astro proxy can
 * stream the JPEG body straight through with the upstream headers intact
 * (Content-Type, Cache-Control). The timeout is generous for the same reason as
 * the commercial route: a cache purge fans out many parallel tile requests and
 * Jimp-based rendering is CPU-bound, so a single tile can legitimately wait past
 * 15 s for its turn on the event loop.
 */
export async function fetchCcGenreArtwork(genreKey: string): Promise<Response> {
  return fetchWithTimeout(backendUrl(ENDPOINTS.v1.ccGenreArtwork(genreKey)), { headers: internalHeaders() }, 60000);
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

/** Fetch a random CC track short ID for the landing page example teaser in CC mode. */
export async function fetchCcRandomExample(): Promise<{ shortId: string } | null> {
  try {
    const res = await fetchWithTimeout(backendUrl(ENDPOINTS.v1.ccRandomExample), { headers: internalHeaders() }, 3000);
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
): Promise<BackendFetchResult<PublicContentPage>> {
  try {
    const url = `${backendUrl(ENDPOINTS.v1.content.detail(slug))}?locale=${locale}`;
    const res = await fetchWithTimeout(url, { headers: internalHeaders(forwardedForExtra(clientIp)) }, 5000);
    if (!res.ok) return backendFailureResult(res);
    return { kind: "success", data: (await res.json()) as PublicContentPage };
  } catch (error) {
    return transportFailureResult(error);
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

/** Forward a CC artist-column request to the backend `ccArtistInfo` endpoint
 *  (Jamendo top + similar tracks + profile). The CC share page loads this async
 *  after the core card renders, so the budget covers the ~4 throttled calls. */
export async function fetchCcArtistInfo(
  jamendoArtistId: string,
  artistName: string,
  clientIp?: string,
): Promise<Response> {
  const params = new URLSearchParams({ jamendoArtistId, artistName });
  return fetchWithTimeout(
    `${backendUrl(ENDPOINTS.v1.ccArtistInfo)}?${params.toString()}`,
    { headers: internalHeaders(forwardedForExtra(clientIp)) },
    20000,
  );
}

/** Forward a CC Bandcamp-presence request to the backend `ccBandcamp` endpoint.
 *  Loaded async by the CC share page after the core card renders; the budget
 *  covers the backend's (cached, timeout-bounded) fuzzy-search scrape. */
export async function fetchCcBandcamp(jamendoId: string, clientIp?: string): Promise<Response> {
  return fetchWithTimeout(
    backendUrl(ENDPOINTS.v1.ccBandcamp(jamendoId)),
    { headers: internalHeaders(forwardedForExtra(clientIp)) },
    12000,
  );
}
