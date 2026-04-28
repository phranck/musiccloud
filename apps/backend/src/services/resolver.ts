/**
 * @file Track resolve pipeline: URL or text -> cross-service link set.
 *
 * This is the core of the product. Every track resolve (whether driven
 * by POST `/api/v1/resolve`, GET `/api/v1/resolve`, or a background
 * job) ends up here. The album and artist resolvers (`album-resolver.ts`,
 * `artist-resolver.ts`) are parallel siblings at a similar abstraction.
 *
 * ## Entry points (public)
 *
 * - `resolveQuery(input)` - front door. Dispatches to URL vs text.
 * - `resolveUrl(url)` - URL input pipeline; handles short-link expansion.
 * - `resolveTextSearch(query)` - single-result text search (used by
 *   the unauthenticated GET endpoint, which cannot carry disambiguation).
 * - `resolveTextSearchWithDisambiguation(query)` - returns either a
 *   resolved track (when confidence is high enough) or a candidate list
 *   (used by the POST endpoint for interactive disambiguation).
 * - `resolveSelectedCandidate(id)` - second leg of the disambiguation
 *   flow, called after a client picks a candidate.
 * - `expandShortLink(url)` - HEAD-request short-link unroller;
 *   exported because the POST route inspects expanded URLs before
 *   content-type routing.
 *
 * ## Cache strategy: three layers
 *
 * Any incoming request tries to avoid upstream API calls in this order:
 *
 * 1. Cache by canonical URL (after tracking-param stripping + short-link
 *    expansion).
 * 2. Cache by the short-link alias (only if the URL was expanded), so a
 *    `link.deezer.com/s/abc` that gets written once as an alias hits the
 *    cache on subsequent visits.
 * 3. Cache by ISRC after we fetched the source metadata. Catches the
 *    same track pasted from a different service the second time around.
 *
 * After migration 0021 the canonical track row never expires; only
 * preview URLs (in `track_previews`) carry an `expires_at` and are
 * refreshed lazily by `fillMissingServices`. The cache hit path
 * through `fillMissingServices` so that enabling a new plugin over
 * time organically enriches the cached row.
 *
 * ## Preview URL preference (Deezer first)
 *
 * Deezer CDN preview URLs are permanent; Spotify preview URLs expire
 * after roughly 30-60 days. Whenever we see a Deezer preview among the
 * resolved links we prefer it over the source track's preview, even
 * going as far as issuing a gap-fill Deezer lookup from
 * `fillMissingServices` when the cached track has no preview at all.
 *
 * ## Artwork fallback chain
 *
 * Some services (notably Tidal's API v2) do not return artwork. When
 * the source track lacks one but has an ISRC, we try Spotify first
 * and Apple Music second, both via `findByIsrc`. The OG-scrape
 * fallback path (`scrapeTrackFromPage`) provides a further artwork
 * source for pages that ship `og:image`.
 *
 * ## SERVICE_DISABLED vs NOT_MUSIC_LINK
 *
 * Before throwing the generic "unrecognized URL" error, the resolver
 * checks against *all* plugins including disabled ones. If the URL
 * matches a disabled plugin, the user sees the more actionable
 * `SERVICE_DISABLED` error with the service name, not a misleading
 * `NOT_MUSIC_LINK`. The admin controls which plugins are enabled;
 * the user only controls which link they paste.
 *
 * ## YouTube Music derivation
 *
 * YouTube and YouTube Music share video IDs. When we match a YouTube
 * video URL, we synthesise the YouTube Music link by swapping the
 * hostname + path prefix, rather than running a separate YT Music
 * search. Same trick as in the album and artist resolvers.
 *
 * ## YouTube search-fallback link
 *
 * If no YouTube match is found but the track has a title and artist,
 * we still emit a `music.youtube.com/search?q=...` link flagged with
 * `isSearchFallback: true`. This guarantees every resolved track has
 * at least a "search on YouTube" option even when the YouTube API
 * could not pin the exact video.
 *
 * ## Adapter timeout
 *
 * `resolveAcrossServices` races each adapter lookup against a 10s
 * timeout via `Promise.race`. Without this cap, a single hung adapter
 * would block the entire resolve until the HTTP client's own timeout
 * (which can be much longer).
 *
 * ## OG-scrape fallback (`scrapeTrackFromPage`)
 *
 * When a URL belongs to a service whose adapter has no API
 * credentials (`isAvailable() === false`), we fall back to fetching
 * the page and parsing OG meta tags. The trick is the
 * `User-Agent: facebookexternalhit/1.1` header: single-page app shells
 * do not server-render OG tags for regular browsers, but they DO render
 * them for known social media crawlers because the page relies on
 * social unfurl previews working. We pretend to be Facebook's link
 * previewer to get the server-rendered variant.
 *
 * The OG-title string is parsed with five language-specific patterns
 * ("Title by Artist on Service" / "Title von Artist bei Service" /
 * etc.) because services localize the OG title based on the request
 * locale. Falling out of all patterns drops to a dash-split and then
 * to a last-resort free-text search.
 *
 * ## Confidence thresholds (in `constants.ts`)
 *
 * | Constant                    | Meaning                                                |
 * | --------------------------- | ------------------------------------------------------ |
 * | `MATCH_MIN_CONFIDENCE`      | Minimum for an adapter to report a result as "found"   |
 * | `LINK_QUALITY_THRESHOLD`    | Minimum for a link to appear in the final result set   |
 * | `AUTO_SELECT_THRESHOLD`     | Above this, text search skips disambiguation entirely  |
 * | `CANDIDATE_MIN_CONFIDENCE`  | Minimum for a candidate to appear in disambiguation    |
 * | `MAX_CANDIDATES`            | Disambiguation list size cap                           |
 * | `SEARCH_FALLBACK_CONFIDENCE`| Confidence of synthesised "search on X" fallback links |
 */
import { PLATFORM_CONFIG } from "@musiccloud/shared";
import { getRepository } from "../db/index.js";
import { fetchWithTimeout } from "../lib/infra/fetch.js";
import { log } from "../lib/infra/logger.js";
import { isUrl, stripTrackingParams, validateMusicUrl } from "../lib/platform/url.js";
import { getPreviewExpiry } from "../lib/preview-url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import {
  AUTO_SELECT_THRESHOLD,
  CANDIDATE_MIN_CONFIDENCE,
  LINK_QUALITY_THRESHOLD,
  MATCH_MIN_CONFIDENCE,
  MAX_CANDIDATES,
  SEARCH_FALLBACK_CONFIDENCE,
} from "./constants.js";
import { collectTrackExternalIds } from "./external-ids.js";
import {
  filterDisabledLinks,
  getActiveAdapters,
  identifyService,
  identifyServiceIncludingDisabled,
  isPluginEnabled,
} from "./index.js";
import type {
  ExternalIdRecord,
  MatchResult,
  NormalizedTrack,
  SearchCandidate,
  ServiceAdapter,
  ServiceId,
} from "./types.js";
import { isValidServiceId } from "./types.js";

export interface ResolvedLink {
  service: ServiceId;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: "isrc" | "search" | "cache";
  /** True when the link is a search URL rather than a direct track link */
  isSearchFallback?: boolean;
  /** Service-specific track ID (e.g. Spotify track ID, Deezer track ID) */
  externalId?: string;
  /** 30-second audio preview URL from this service (if available) */
  previewUrl?: string;
  /**
   * ISRC reported by this service for the track. May differ from the
   * source track's ISRC for regional variants / re-releases — that is
   * precisely the surface we want to aggregate. Optional because not
   * every adapter exposes an ISRC for every match.
   */
  isrc?: string;
  /**
   * MusicBrainz Recording MBID reported by this service for the track.
   * Today only the MusicBrainz adapter populates this; other adapters
   * leave it undefined. Drives `track_external_ids` aggregation.
   */
  mbid?: string;
  /**
   * ISWC of the underlying composition (work). Populated by the
   * MusicBrainz adapter when work-rels are returned. Drives
   * `track_external_ids` aggregation as `idType='iswc'`.
   */
  iswc?: string;
}

export interface ResolutionResult {
  sourceTrack: NormalizedTrack;
  links: ResolvedLink[];
  trackId?: string; // present when loaded from cache
  /** Set when the original input was a short/redirect link (e.g. link.deezer.com/s/…) that was expanded. */
  inputUrl?: string;
  /**
   * External-id observations harvested across every adapter contacted
   * during the resolve. Persisted into `track_external_ids` so the
   * aggregation grows beyond the single canonical `tracks.isrc`.
   * Always present; empty array when the resolve produced no IDs
   * (e.g. cache hit where re-collection is skipped).
   */
  externalIds: ExternalIdRecord[];
}

export interface TextSearchResult {
  kind: "resolved" | "disambiguation";
  result?: ResolutionResult;
  candidates?: SearchCandidate[];
}

function mapCachedLinks(
  links: Array<{ service: string; url: string; confidence: number; matchMethod: string }>,
): ResolvedLink[] {
  return links
    .filter((l) => isValidServiceId(l.service))
    .map((l) => ({
      service: l.service as ServiceId,
      displayName: PLATFORM_CONFIG[l.service as ServiceId].label,
      url: l.url,
      confidence: l.confidence,
      matchMethod: l.matchMethod as "isrc" | "search" | "cache",
    }));
}

/**
 * Try to serve a result from DB cache.
 *
 * Static-vs-dynamic split (migration 0021): the canonical track row is
 * permanently fresh — a cache hit always wins regardless of `updated_at`.
 * The only time-sensitive field, the preview URL, lives in
 * `track_previews` and is refreshed lazily by `fillMissingServices`
 * when its `expires_at` is in the past. Returns null only on miss or
 * read errors.
 */
async function tryCache(lookup: { url?: string; isrc?: string }): Promise<ResolutionResult | null> {
  try {
    const repo = await getRepository();
    let cached = lookup.url ? await repo.findTrackByUrl(lookup.url) : null;
    if (!cached && lookup.isrc) cached = await repo.findTrackByIsrc(lookup.isrc);
    if (!cached) return null;

    const links = mapCachedLinks(cached.links);
    log.debug("Resolver", `Cache hit: ${links.length} links`);

    return { sourceTrack: cached.track, links, trackId: cached.trackId, externalIds: [] };
  } catch (error) {
    log.error("Resolver", `Cache read failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function fillMissingServices(cached: ResolutionResult): Promise<ResolutionResult> {
  const coveredServices = new Set(cached.links.map((l) => l.service));
  const active = await getActiveAdapters();

  const missingAdapters = active.filter((a) => !coveredServices.has(a.id) && a.id !== cached.sourceTrack.sourceService);

  // Static-vs-dynamic split: a missing or expired preview-URL row is the
  // ONLY reason to re-fetch Deezer for a row whose service-link list is
  // already complete. Previously this fired on every cache hit when
  // `sourceTrack.previewUrl` was empty; now it fires only when the
  // `track_previews` row for the chosen preview source is genuinely
  // expired (or absent).
  const needsPreview = await isPreviewRefreshNeeded(cached);
  const deezerAdapter = needsPreview
    ? active.find(
        (a) =>
          a.id === "deezer" &&
          a.id !== cached.sourceTrack.sourceService &&
          !missingAdapters.some((m) => m.id === "deezer"),
      )
    : undefined;

  const adaptersToFetch = deezerAdapter ? [...missingAdapters, deezerAdapter] : missingAdapters;

  if (adaptersToFetch.length === 0) return { ...cached, links: await filterDisabledLinks(cached.links) };

  log.debug(
    "Resolver",
    `Gap-filling ${adaptersToFetch.length} services for cached track${deezerAdapter ? " (incl. Deezer for preview)" : ""}`,
  );

  const results = await Promise.allSettled(adaptersToFetch.map((a) => resolveOnService(a, cached.sourceTrack)));

  const newLinks: ResolvedLink[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value) {
      newLinks.push(result.value);
    }
  }

  if (newLinks.length === 0) return { ...cached, links: await filterDisabledLinks(cached.links) };

  // Only persist genuinely new service links (not Deezer re-fetched for preview only)
  const genuinelyNewLinks = newLinks.filter((l) => !coveredServices.has(l.service));
  if (cached.trackId && genuinelyNewLinks.length > 0) {
    try {
      const repo = await getRepository();
      await repo.addLinksToTrack(
        cached.trackId,
        genuinelyNewLinks.map((l) => ({
          service: l.service,
          url: l.url,
          confidence: l.confidence,
          matchMethod: l.matchMethod,
          externalId: l.externalId,
        })),
      );
    } catch (error) {
      log.error("Resolver", `Failed to persist gap-fill links: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Don't add Deezer twice to allLinks if it was only re-fetched for preview
  const allLinks = [...cached.links, ...genuinelyNewLinks].sort((a, b) => b.confidence - a.confidence);

  // Always prefer a fresh Deezer preview URL. Deezer CDN URLs are permanent,
  // Spotify preview URLs expire after ~30-60 days. Overwrite any existing value.
  let sourceTrack = cached.sourceTrack;
  const deezerGapLink = newLinks.find((l) => l.service === "deezer" && l.previewUrl);
  const anyGapPreview = deezerGapLink ?? newLinks.find((l) => l.previewUrl);
  if (anyGapPreview?.previewUrl) {
    sourceTrack = { ...sourceTrack, previewUrl: anyGapPreview.previewUrl };
  }

  // Persist any fresh preview URLs we just picked up, including their
  // parsed expiry. Skips Spotify-style permanent CDN URLs that have
  // `null` expiry (overwriting a row with `null` is fine — the gate
  // logic treats null as "never expires").
  if (cached.trackId) {
    try {
      const repo = await getRepository();
      for (const link of newLinks) {
        if (!link.previewUrl) continue;
        const expiresAtMs = getPreviewExpiry(link.previewUrl, link.service);
        await repo.upsertTrackPreview(cached.trackId, {
          service: link.service,
          url: link.previewUrl,
          expiresAt: expiresAtMs ? new Date(expiresAtMs) : null,
        });
      }
    } catch (error) {
      log.error("Resolver", `Failed to persist preview rows: ${error instanceof Error ? error.message : error}`);
    }
  }

  return {
    sourceTrack,
    links: await filterDisabledLinks(allLinks),
    trackId: cached.trackId,
    externalIds: collectTrackExternalIds(sourceTrack, newLinks),
  };
}

/**
 * Returns true when the cached track has no usable preview URL or the
 * persisted `track_previews` row for the source service has expired.
 *
 * Pre-migration logic: any cached track without `previewUrl` set on the
 * row triggered a Deezer fetch on every cache hit.
 *
 * Post-migration logic: the canonical row no longer carries the URL;
 * this function asks the `track_previews` table directly. A row whose
 * `expires_at` is in the past, or which is missing entirely, is what
 * the Deezer refresh now exists to fix.
 */
async function isPreviewRefreshNeeded(cached: ResolutionResult): Promise<boolean> {
  if (!cached.trackId) return !cached.sourceTrack.previewUrl;
  try {
    const repo = await getRepository();
    const previews = await repo.findTrackPreviews(cached.trackId);
    if (previews.length === 0) return true;
    const now = Date.now();
    const fresh = previews.find((p) => p.expiresAt === null || p.expiresAt.getTime() > now);
    return !fresh;
  } catch (error) {
    log.debug(
      "Resolver",
      `Preview-refresh check failed, defaulting to refresh: ${error instanceof Error ? error.message : error}`,
    );
    return true;
  }
}

/**
 * Confidence scoring constants (unified strategy).
 *
 * MATCH_MIN_CONFIDENCE: Minimum score for an adapter to consider a result "found".
 * LINK_QUALITY_THRESHOLD: Minimum score for inclusion in final cross-service results.
 * AUTO_SELECT_THRESHOLD: Above this, text search auto-selects without disambiguation.
 * CANDIDATE_MIN_CONFIDENCE: Minimum score to appear in disambiguation list.
 * CACHE_CONFIDENCE: Confidence assigned to DB-cached search results.
 * SEARCH_FALLBACK_CONFIDENCE: Confidence for generic "search on X" fallback links.
 */
export { LINK_QUALITY_THRESHOLD, MATCH_MIN_CONFIDENCE };

/** Hosts that serve redirect short links pointing to canonical music platform URLs. */
const SHORT_LINK_HOSTS = new Set(["link.deezer.com", "on.soundcloud.com"]);

/**
 * If `url` is a known short link, follows the redirect (HEAD) and returns the
 * final canonical URL. Falls back to the original URL on network failure.
 */
export async function expandShortLink(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!SHORT_LINK_HOSTS.has(parsed.hostname)) return url;
  try {
    const res = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" });
    if (res.url && res.url !== url) return res.url;
  } catch {
    // Network failure – fall through so the caller can surface a meaningful error
  }
  return url;
}

/**
 * Main entry point used by both public resolve routes. Dispatches to
 * `resolveUrl` for URL input and `resolveTextSearch` for free text.
 * URL validation runs *before* dispatch so unsupported content types
 * (e.g. playlists, podcasts) surface a precise error rather than
 * entering the track pipeline.
 *
 * @param input - raw user input, URL or text
 * @returns resolved track result
 * @throws `ResolveError` with the validation code when the input is a
 *         non-track URL, or any of the pipeline errors documented on
 *         `resolveUrl` / `resolveTextSearch`
 */
export async function resolveQuery(input: string): Promise<ResolutionResult> {
  const trimmed = input.trim();

  if (isUrl(trimmed)) {
    // Last.fm URLs from genre-search are not a streaming service — extract
    // artist + title and resolve as a text search.
    const lastfmQuery = parseLastfmUrl(trimmed);
    if (lastfmQuery) return resolveTextSearch(lastfmQuery);

    // Validate URL for unsupported content types
    const validation = validateMusicUrl(trimmed);
    if (!validation.valid) {
      throw new ResolveError(validation.code, validation.message);
    }
    // Pass the raw URL – resolveUrl handles tracking-param stripping and short-link expansion
    return resolveUrl(trimmed);
  }

  return resolveTextSearch(trimmed);
}

/**
 * URL input pipeline. See the file header for the three-layer cache,
 * SERVICE_DISABLED vs NOT_MUSIC_LINK ordering, preview URL preference,
 * artwork fallback chain, and OG-scrape escape hatch.
 *
 * @param inputUrl - streaming-service URL identifying a track
 * @returns resolved track result, with `inputUrl` set when the input
 *          was a short link that got expanded (route handler uses this
 *          to persist the short link as a cache alias)
 * @throws `ResolveError("SERVICE_DISABLED")` if the URL belongs to a currently-disabled plugin
 * @throws `ResolveError("NOT_MUSIC_LINK")` if no adapter recognizes the URL shape
 * @throws `ResolveError("INVALID_URL")` if the adapter cannot extract a track ID
 * @throws `ResolveError("SERVICE_DOWN")` (or adapter MC code) if metadata fetch fails and scrape also fails
 */
export async function resolveUrl(inputUrl: string): Promise<ResolutionResult> {
  // Strip tracking params, then expand short links (e.g. link.deezer.com/s/…)
  const strippedInput = stripTrackingParams(inputUrl);
  const expandedUrl = await expandShortLink(strippedInput);
  const cleanUrl = stripTrackingParams(expandedUrl); // strip again in case expanded URL carries UTMs
  const wasExpanded = cleanUrl !== strippedInput;

  // Helper: attach the original short-link URL so the route handler can save it as an alias
  const withAlias = (r: ResolutionResult): ResolutionResult => (wasExpanded ? { ...r, inputUrl: strippedInput } : r);

  // 1. Cache lookup by URL (try canonical first; fall back to the short link as alias)
  const cachedByCanonical = await tryCache({ url: cleanUrl });
  if (cachedByCanonical) return withAlias(await fillMissingServices(cachedByCanonical));
  if (wasExpanded) {
    const cachedByAlias = await tryCache({ url: strippedInput });
    if (cachedByAlias) return withAlias(await fillMissingServices(cachedByAlias));
  }

  // 2. Identify which service the URL belongs to.
  //    Check against ALL plugins first so we can distinguish a truly
  //    unknown URL (NOT_MUSIC_LINK) from a known-but-disabled one
  //    (SERVICE_DISABLED). The user controls which link to paste; the
  //    admin controls which plugins are on.
  const identified = await identifyServiceIncludingDisabled(cleanUrl);
  if (identified && !(await isPluginEnabled(identified.id))) {
    throw new ResolveError("SERVICE_DISABLED", undefined, { service: identified.id });
  }
  const sourceAdapter = await identifyService(cleanUrl);
  if (!sourceAdapter) {
    throw new ResolveError("NOT_MUSIC_LINK", "Unrecognized music service URL");
  }

  const trackId = sourceAdapter.detectUrl(cleanUrl);
  if (!trackId) {
    throw new ResolveError("INVALID_URL", "Could not extract track ID from URL");
  }

  // 3. Fetch metadata
  let sourceTrack: NormalizedTrack;
  try {
    sourceTrack = await sourceAdapter.getTrack(trackId);
  } catch (error) {
    if (!sourceAdapter.isAvailable()) {
      return withAlias(await resolveUrlViaScrape(cleanUrl, sourceAdapter.id));
    }
    if (error instanceof ResolveError) throw error;
    throw new ResolveError(
      "SERVICE_DOWN",
      `Failed to fetch track from ${sourceAdapter.id}: ${error instanceof Error ? error.message : error}`,
    );
  }

  // 3b. Cache lookup by ISRC (in case same track was resolved via different URL)
  if (sourceTrack.isrc) {
    const cachedByIsrc = await tryCache({ isrc: sourceTrack.isrc });
    if (cachedByIsrc) return withAlias(await fillMissingServices(cachedByIsrc));
  }

  // 4. Resolve on all other services in parallel
  const links = await resolveAcrossServices(sourceTrack, sourceAdapter);

  // 5. Add the source service link
  links.unshift({
    service: sourceAdapter.id,
    displayName: sourceAdapter.displayName,
    url: sourceTrack.webUrl,
    confidence: 1.0,
    matchMethod: "isrc",
    externalId: sourceTrack.sourceId,
    previewUrl: sourceTrack.previewUrl,
  });

  // 6. Always prefer a stable Deezer preview URL over any other service.
  // Deezer CDN URLs are permanent; Spotify preview URLs expire after ~30-60 days.
  const deezerLink = links.find((l) => l.service === "deezer" && l.previewUrl);
  const bestPreviewUrl =
    deezerLink?.previewUrl ?? links.find((l) => l.previewUrl)?.previewUrl ?? sourceTrack.previewUrl;
  if (bestPreviewUrl !== sourceTrack.previewUrl) {
    sourceTrack = { ...sourceTrack, previewUrl: bestPreviewUrl };
  }

  // 7. If source service has no artwork but has ISRC, fetch artwork from Spotify/Apple Music
  // (e.g., Tidal doesn't provide artworkUrl in API response)
  if (!sourceTrack.artworkUrl && sourceTrack.isrc) {
    const isrc = sourceTrack.isrc;
    try {
      const active = await getActiveAdapters();
      const spotifyAdapter = active.find((a) => a.id === "spotify");
      const appleAdapter = active.find((a) => a.id === "apple-music");

      if (spotifyAdapter) {
        const spotifyTrack = await spotifyAdapter.findByIsrc(isrc);
        if (spotifyTrack?.artworkUrl) {
          sourceTrack = { ...sourceTrack, artworkUrl: spotifyTrack.artworkUrl };
        }
      }

      // Fallback to Apple Music if Spotify doesn't have artwork
      if (!sourceTrack.artworkUrl && appleAdapter) {
        const appleTrack = await appleAdapter.findByIsrc(isrc);
        if (appleTrack?.artworkUrl) {
          sourceTrack = { ...sourceTrack, artworkUrl: appleTrack.artworkUrl };
        }
      }
    } catch {
      // Artwork fetch failed - continue with original (no artwork)
    }
  }

  return withAlias({
    sourceTrack,
    links,
    externalIds: collectTrackExternalIds(sourceTrack, links),
  });
}

export async function resolveTextSearch(query: string): Promise<ResolutionResult> {
  // Service search: try all active adapters
  const searchAdapters = await getActiveAdapters();
  for (const adapter of searchAdapters) {
    try {
      const result = await adapter.searchTrack({
        title: query,
        artist: query,
      });

      if (result.found && result.track) {
        // Cache lookup by ISRC before full cross-service resolve
        if (result.track.isrc) {
          const cached = await tryCache({ isrc: result.track.isrc });
          if (cached) return fillMissingServices(cached);
        }

        const links = await resolveAcrossServices(result.track, adapter);
        links.unshift({
          service: adapter.id,
          displayName: adapter.displayName,
          url: result.track.webUrl,
          confidence: result.confidence,
          matchMethod: "search",
          externalId: result.track.sourceId,
        });

        return {
          sourceTrack: result.track,
          links,
          externalIds: collectTrackExternalIds(result.track, links),
        };
      }
    } catch {}
  }

  throw new ResolveError("TRACK_NOT_FOUND", "No track found for the search query");
}

/**
 * Text search variant used by the authenticated POST endpoint.
 *
 * Returns `{ kind: "resolved" }` when a single clear match exists
 * (either through the adapter's native candidate API, or a good
 * confidence on the plain `searchTrack`). Returns
 * `{ kind: "disambiguation" }` with up to `MAX_CANDIDATES` candidates
 * when confidence is below `AUTO_SELECT_THRESHOLD`. The client then
 * calls `resolveSelectedCandidate` with the picked candidate's ID.
 *
 * Adapters that implement `searchTrackWithCandidates` (e.g. Spotify)
 * get the richer path; others fall back to single-result
 * `searchTrack`, which can only trigger the auto-resolve branch.
 *
 * @param query - free-text search query
 * @returns either a resolved track or a candidate list
 * @throws `ResolveError("TRACK_NOT_FOUND")` if no adapter returns anything usable
 */
export async function resolveTextSearchWithDisambiguation(query: string): Promise<TextSearchResult> {
  log.debug("Resolver", "resolveTextSearchWithDisambiguation called with:", query);

  // Service search: try adapters that support searchTrackWithCandidates, then fall back
  const searchAdapters = await getActiveAdapters();

  for (const adapter of searchAdapters) {
    try {
      // Use searchTrackWithCandidates if available (e.g. Spotify)
      if (adapter.searchTrackWithCandidates) {
        const searchResult = await adapter.searchTrackWithCandidates({
          title: query,
          artist: query,
        });

        if (searchResult.candidates.length === 0) continue;

        const topCandidate = searchResult.candidates[0];

        // Auto-select when confidence is high enough
        if (topCandidate.confidence >= AUTO_SELECT_THRESHOLD) {
          // Cache lookup by ISRC before full resolve
          if (topCandidate.track.isrc) {
            const cached = await tryCache({ isrc: topCandidate.track.isrc });
            if (cached) {
              return {
                kind: "resolved",
                result: { ...cached, links: await filterDisabledLinks(cached.links) },
              };
            }
          }

          const links = await resolveAcrossServices(topCandidate.track, adapter);
          links.unshift({
            service: adapter.id,
            displayName: adapter.displayName,
            url: topCandidate.track.webUrl,
            confidence: topCandidate.confidence,
            matchMethod: "search",
            externalId: topCandidate.track.sourceId,
          });

          return {
            kind: "resolved",
            result: {
              sourceTrack: topCandidate.track,
              links,
              externalIds: collectTrackExternalIds(topCandidate.track, links),
            },
          };
        }

        // Return candidates for disambiguation
        const candidates: SearchCandidate[] = searchResult.candidates
          .filter((c) => c.confidence >= CANDIDATE_MIN_CONFIDENCE)
          .slice(0, MAX_CANDIDATES)
          .map((c) => ({
            id: `${c.track.sourceService}:${c.track.sourceId}`,
            title: c.track.title,
            artists: c.track.artists,
            albumName: c.track.albumName,
            artworkUrl: c.track.artworkUrl,
            durationMs: c.track.durationMs,
            confidence: c.confidence,
          }));

        return { kind: "disambiguation", candidates };
      }

      // Fallback: use regular searchTrack
      const result = await adapter.searchTrack({
        title: query,
        artist: query,
      });

      if (result.found && result.track) {
        // Cache lookup by ISRC before full resolve
        if (result.track.isrc) {
          const cached = await tryCache({ isrc: result.track.isrc });
          if (cached) {
            return {
              kind: "resolved",
              result: { ...cached, links: await filterDisabledLinks(cached.links) },
            };
          }
        }

        const links = await resolveAcrossServices(result.track, adapter);
        links.unshift({
          service: adapter.id,
          displayName: adapter.displayName,
          url: result.track.webUrl,
          confidence: result.confidence,
          matchMethod: "search",
          externalId: result.track.sourceId,
        });

        return {
          kind: "resolved",
          result: {
            sourceTrack: result.track,
            links,
            externalIds: collectTrackExternalIds(result.track, links),
          },
        };
      }
    } catch {}
  }

  throw new ResolveError("TRACK_NOT_FOUND", "No track found for the search query");
}

/**
 * Second leg of the disambiguation flow. The client passes back the ID
 * of the candidate it picked (format: `<service>:<trackId>`), and the
 * resolver completes the full cross-service resolve against that track.
 *
 * @param candidateId - stable ID from a disambiguation candidate
 *                      (`sourceService:sourceId` as minted in
 *                      `resolveTextSearchWithDisambiguation`)
 * @returns resolved track result
 * @throws `ResolveError("INVALID_URL")` if the candidate ID is malformed
 * @throws `ResolveError("SERVICE_DOWN")` if the referenced service adapter is unavailable
 */
export async function resolveSelectedCandidate(candidateId: string): Promise<ResolutionResult> {
  // candidateId format: "spotify:trackId"
  const [service, trackId] = candidateId.split(":", 2);
  if (!service || !trackId) {
    throw new ResolveError("INVALID_URL", "Invalid candidate ID format");
  }

  const active = await getActiveAdapters();
  const adapter = active.find((a) => a.id === service);
  if (!adapter) {
    throw new ResolveError("SERVICE_DOWN", `${service} is not available`);
  }

  const sourceTrack = await adapter.getTrack(trackId);

  // Cache lookup by ISRC before full cross-service resolve
  if (sourceTrack.isrc) {
    const cached = await tryCache({ isrc: sourceTrack.isrc });
    if (cached) return { ...cached, links: await filterDisabledLinks(cached.links) };
  }

  const links = await resolveAcrossServices(sourceTrack, adapter);

  links.unshift({
    service: adapter.id,
    displayName: adapter.displayName,
    url: sourceTrack.webUrl,
    confidence: 1.0,
    matchMethod: "search",
    externalId: sourceTrack.sourceId,
  });

  return {
    sourceTrack,
    links,
    externalIds: collectTrackExternalIds(sourceTrack, links),
  };
}

async function resolveAcrossServices(
  sourceTrack: NormalizedTrack,
  excludeAdapter: ServiceAdapter,
): Promise<ResolvedLink[]> {
  const active = await getActiveAdapters();
  const targetAdapters = active.filter((a) => a.id !== excludeAdapter.id);

  const ADAPTER_TIMEOUT_MS = 10_000;

  const withTimeout = (adapter: ServiceAdapter): Promise<ResolvedLink | null> =>
    Promise.race([
      resolveOnService(adapter, sourceTrack),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${ADAPTER_TIMEOUT_MS}ms`)), ADAPTER_TIMEOUT_MS),
      ),
    ]);

  // Resolve on each target service in parallel
  const results = await Promise.allSettled(targetAdapters.map((adapter) => withTimeout(adapter)));

  const links: ResolvedLink[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const adapter = targetAdapters[i];

    if (result.status === "fulfilled" && result.value) {
      log.debug("Resolver", `[${adapter.id}] matched: confidence=${result.value.confidence}`);
      links.push(result.value);
    } else if (result.status === "fulfilled") {
      log.debug("Resolver", `[${adapter.id}] no match found`);
    } else {
      log.error(
        "Resolver",
        `[${adapter.id}] resolve failed: ${result.reason instanceof Error ? result.reason.message : result.reason}`,
      );
    }
  }

  // Derive YouTube Music link from YouTube result (same video ID, different domain)
  const youtubeLink = links.find((l) => l.service === "youtube");
  if (youtubeLink && !links.some((l) => l.service === "youtube-music")) {
    const videoIdMatch = /[?&]v=([^&]+)/.exec(youtubeLink.url);
    if (videoIdMatch) {
      links.push({
        service: "youtube-music",
        displayName: "YouTube Music",
        url: `https://music.youtube.com/watch?v=${videoIdMatch[1]}`,
        confidence: youtubeLink.confidence,
        matchMethod: youtubeLink.matchMethod,
        externalId: youtubeLink.externalId,
      });
    }
  }

  // For services with no match, add YouTube search fallback
  const coveredServices = new Set([excludeAdapter.id, ...links.map((l) => l.service)]);

  if (!coveredServices.has("youtube") && sourceTrack.title && sourceTrack.artists.length > 0) {
    const searchQuery = encodeURIComponent(`${sourceTrack.artists[0]} ${sourceTrack.title}`);
    links.push({
      service: "youtube",
      displayName: "YouTube",
      url: `https://music.youtube.com/search?q=${searchQuery}`,
      confidence: SEARCH_FALLBACK_CONFIDENCE,
      matchMethod: "search",
      isSearchFallback: true,
    });
  }

  // Sort by confidence (highest first)
  links.sort((a, b) => b.confidence - a.confidence);

  // Filter out low-confidence matches (but keep search fallbacks)
  return links.filter((l) => l.confidence >= LINK_QUALITY_THRESHOLD || l.isSearchFallback);
}

async function resolveOnService(adapter: ServiceAdapter, sourceTrack: NormalizedTrack): Promise<ResolvedLink | null> {
  // Strategy 1: ISRC lookup (most reliable)
  if (adapter.capabilities.supportsIsrc && sourceTrack.isrc) {
    if (adapter.id === "youtube") {
      // YouTube doesn't support ISRC anyway, but just in case
      return resolveViaSearch(adapter, sourceTrack);
    }

    const track = await adapter.findByIsrc(sourceTrack.isrc);
    if (track) {
      return {
        service: adapter.id,
        displayName: adapter.displayName,
        url: track.webUrl,
        confidence: 1.0,
        matchMethod: "isrc",
        externalId: track.sourceId,
        previewUrl: track.previewUrl,
        isrc: track.isrc,
        mbid: track.mbid,
        iswc: track.iswc,
      };
    }
  }

  // Strategy 2: Text search (fallback)
  return resolveViaSearch(adapter, sourceTrack);
}

async function resolveViaSearch(adapter: ServiceAdapter, sourceTrack: NormalizedTrack): Promise<ResolvedLink | null> {
  const result: MatchResult = await adapter.searchTrack({
    title: sourceTrack.title,
    artist: sourceTrack.artists[0] ?? "",
    album: sourceTrack.albumName,
  });

  if (!result.found || !result.track) return null;

  return {
    service: adapter.id,
    displayName: adapter.displayName,
    url: result.track.webUrl,
    confidence: result.confidence,
    matchMethod: result.matchMethod,
    externalId: result.track.sourceId,
    previewUrl: result.track.previewUrl,
    isrc: result.track.isrc,
    mbid: result.track.mbid,
    iswc: result.track.iswc,
  };
}

/**
 * Scrape OG meta tags from a music service page to extract title and artist.
 * Used as fallback when the source adapter has no API credentials.
 *
 * Supports formats:
 *   - English: "Title by Artist on Service"
 *   - German: "„Title" von Artist bei Service"
 *   - French: "Title par Artist sur Service"
 *   - Generic fallback: split on common separators
 */
async function scrapeTrackFromPage(
  url: string,
): Promise<{ title: string; artist: string; artworkUrl?: string } | null> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          // Bot UA gets server-rendered OG tags (SPA shells don't include them)
          "User-Agent": "facebookexternalhit/1.1",
        },
        redirect: "follow",
      },
      8000,
    );

    if (!response.ok) return null;

    const html = await response.text();

    // Extract og:title
    const ogTitleMatch = /<meta\s+property="og:title"\s+content="([^"]*)"/i.exec(html);
    if (!ogTitleMatch?.[1]) return null;

    const ogTitle = ogTitleMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/\u201E|\u201C|\u201D/g, ""); // Remove „ " " quotes

    // Extract og:image for artwork
    const ogImageMatch = /<meta\s+property="og:image"\s+content="([^"]*)"/i.exec(html);
    const artworkUrl = ogImageMatch?.[1] || undefined;

    // Try locale-aware patterns: "Title by Artist on Service", "Title von Artist bei Service"
    const patterns = [
      /^(.+?)\s+by\s+(.+?)\s+on\s+.+$/i, // English
      /^(.+?)\s+von\s+(.+?)\s+bei\s+.+$/i, // German
      /^(.+?)\s+par\s+(.+?)\s+sur\s+.+$/i, // French
      /^(.+?)\s+di\s+(.+?)\s+su\s+.+$/i, // Italian
      /^(.+?)\s+de\s+(.+?)\s+en\s+.+$/i, // Spanish
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(ogTitle);
      if (match?.[1] && match?.[2]) {
        return { title: match[1].trim(), artist: match[2].trim(), artworkUrl };
      }
    }

    // Fallback: use og:title as free-text query (strip " on/bei/sur ServiceName")
    const stripped = ogTitle
      .replace(
        /\s+(on|bei|sur|su|en)\s+(Apple Music|Spotify|Deezer|Tidal|YouTube|SoundCloud|Qobuz|Pandora|Napster|Audius).*$/i,
        "",
      )
      .trim();

    if (stripped && stripped !== ogTitle) {
      // "Title - Artist" or "Title by Artist" without service suffix
      const dashSplit = stripped.split(/\s+[-–—]\s+/);
      if (dashSplit.length >= 2) {
        return { title: dashSplit[0].trim(), artist: dashSplit[1].trim(), artworkUrl };
      }
    }

    // Last resort: use the cleaned title as both title and artist (free-text search)
    if (stripped && !stripped.toLowerCase().includes("web player")) {
      return { title: stripped, artist: stripped, artworkUrl };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fallback resolver for URLs where the source adapter has no API credentials.
 * Scrapes the page for OG metadata, then does a cross-service text search.
 */
async function resolveUrlViaScrape(url: string, sourceServiceId: ServiceId): Promise<ResolutionResult> {
  const scraped = await scrapeTrackFromPage(url);
  if (!scraped) {
    throw new ResolveError(
      "SERVICE_DOWN",
      `Cannot resolve ${sourceServiceId} URL: adapter not configured and page scrape failed`,
    );
  }

  log.debug("Resolver", `Scraped from page: "${scraped.title}" by ${scraped.artist}`);

  // Search across all active adapters
  const searchAdapters = await getActiveAdapters();
  const query = { title: scraped.title, artist: scraped.artist };

  let bestSourceTrack: NormalizedTrack | null = null;
  let bestAdapter: ServiceAdapter | null = null;
  let bestConfidence = 0;

  for (const adapter of searchAdapters) {
    try {
      const result = await adapter.searchTrack(query);
      if (result.found && result.track && result.confidence > bestConfidence) {
        bestSourceTrack = result.track;
        bestAdapter = adapter;
        bestConfidence = result.confidence;
      }
    } catch {}
  }

  if (!bestSourceTrack || !bestAdapter) {
    throw new ResolveError("TRACK_NOT_FOUND", `Track not found: "${scraped.title}" by ${scraped.artist}`);
  }

  // ISRC cache check
  if (bestSourceTrack.isrc) {
    const cached = await tryCache({ isrc: bestSourceTrack.isrc });
    if (cached) return { ...cached, links: await filterDisabledLinks(cached.links) };
  }

  // Resolve across all other services
  const links = await resolveAcrossServices(bestSourceTrack, bestAdapter);

  // Add the source adapter's match
  links.unshift({
    service: bestAdapter.id,
    displayName: bestAdapter.displayName,
    url: bestSourceTrack.webUrl,
    confidence: bestConfidence,
    matchMethod: "search",
    externalId: bestSourceTrack.sourceId,
  });

  // Add the original URL as a link for the source service
  links.unshift({
    service: sourceServiceId,
    displayName: PLATFORM_CONFIG[sourceServiceId].label,
    url,
    confidence: 0.9,
    matchMethod: "search",
  });

  // Use scraped artwork if the source track doesn't have one
  if (!bestSourceTrack.artworkUrl && scraped.artworkUrl) {
    bestSourceTrack = { ...bestSourceTrack, artworkUrl: scraped.artworkUrl };
  }

  return {
    sourceTrack: bestSourceTrack,
    links,
    externalIds: collectTrackExternalIds(bestSourceTrack, links),
  };
}

// ─── Last.fm URL → text query ──────────────────────────────────────────────
//
// Last.fm URLs from genre-search have three shapes:
//   /music/Artist/_/Track   → "Artist - Track"
//   /music/Artist/Album     → "Artist - Album"
//   /music/Artist           → "Artist"
//
// Path segments are URL-encoded (`%20`, `+`). We decode them and return
// a plain-text query string that resolveTextSearch can handle.

const LASTFM_HOST_RE = /^(?:www\.)?last\.fm$/i;

function parseLastfmUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!LASTFM_HOST_RE.test(parsed.hostname)) return null;

  // /music/Artist/_/Track  or  /music/Artist/Album  or  /music/Artist
  const match = parsed.pathname.match(/^\/music\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?/);
  if (!match) return null;

  const artist = decodeURIComponent(match[1].replace(/\+/g, " "));
  const second = match[2] ? decodeURIComponent(match[2].replace(/\+/g, " ")) : null;
  const third = match[3] ? decodeURIComponent(match[3].replace(/\+/g, " ")) : null;

  // /music/Artist/_/Track → text search "Artist - Track"
  if (second === "_" && third) return `${artist} - ${third}`;
  // /music/Artist/Album → text search "Artist - Album"
  if (second && second !== "_") return `${artist} - ${second}`;
  // /music/Artist → text search "Artist"
  return artist;
}
