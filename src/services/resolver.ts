import type { ServiceId, NormalizedTrack, MatchResult, ServiceAdapter, SearchCandidate } from "./types.js";
import { isValidServiceId } from "./types.js";
import { adapters, identifyService } from "./index.js";
import { resolveViaOdesli } from "./odesli.js";
import { validateMusicUrl, stripTrackingParams, isUrl } from "../lib/url-parser.js";
import { PLATFORM_CONFIG } from "../lib/utils.js";
import { ResolveError } from "../lib/errors.js";
import type { ErrorCode } from "../lib/errors.js";
import { getRepository } from "../db/index.js";
import { log } from "../lib/logger.js";

export interface ResolvedLink {
  service: ServiceId;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: "isrc" | "search" | "odesli" | "cache";
  /** True when the link is a search URL rather than a direct track link */
  isSearchFallback?: boolean;
  /** Service-specific track ID (e.g. Spotify track ID, Deezer track ID) */
  externalId?: string;
}

export interface ResolutionResult {
  sourceTrack: NormalizedTrack;
  links: ResolvedLink[];
}

export interface TextSearchResult {
  kind: "resolved" | "disambiguation";
  result?: ResolutionResult;
  candidates?: SearchCandidate[];
}

function mapCachedLinks(links: Array<{ service: string; url: string; confidence: number; matchMethod: string }>): ResolvedLink[] {
  return links
    .filter((l) => isValidServiceId(l.service))
    .map((l) => ({
      service: l.service as ServiceId,
      displayName: PLATFORM_CONFIG[l.service as ServiceId].label,
      url: l.url,
      confidence: l.confidence,
      matchMethod: l.matchMethod as "isrc" | "search" | "odesli" | "cache",
    }));
}

/** Services that Odesli can potentially provide links for */
const ODESLI_KNOWN_SERVICES: ServiceId[] = [
  "spotify", "apple-music", "youtube", "youtube-music",
  "soundcloud", "tidal", "deezer", "napster", "pandora",
];

/**
 * Fill gaps in resolved links by calling Odesli for uncovered services.
 * Non-fatal: if Odesli fails, the existing links are returned unchanged.
 *
 * NOTE: Odesli is currently disabled. This function returns early until re-enabled.
 */
async function gapFillViaOdesli(
  _sourceUrl: string,
  existingLinks: ResolvedLink[],
): Promise<ResolvedLink[]> {
  // Odesli is disabled - return links unchanged to avoid unnecessary HTTP requests
  return existingLinks;
}

/**
 * Try to serve a result from DB cache. Returns null on miss, expired TTL, or errors.
 * Non-fatal: cache errors are logged but never propagate.
 */
async function tryCache(lookup: { url?: string; isrc?: string }): Promise<ResolutionResult | null> {
  try {
    const repo = await getRepository();
    let cached = lookup.url ? await repo.findTrackByUrl(lookup.url) : null;
    if (!cached && lookup.isrc) cached = await repo.findTrackByIsrc(lookup.isrc);
    if (!cached) return null;

    const age = Date.now() - cached.updatedAt;
    if (age > CACHE_TTL_MS) {
      log.debug("Resolver", `Cache expired: age=${Math.round(age / 3600000)}h`);
      return null;
    }

    const links = mapCachedLinks(cached.links);
    log.debug("Resolver", `Cache hit: ${links.length} links, age=${Math.round(age / 60000)}min`);

    return { sourceTrack: cached.track, links };
  } catch (error) {
    log.error("Resolver", `Cache read failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Confidence scoring constants (unified strategy).
 *
 * MATCH_MIN_CONFIDENCE: Minimum score for an adapter to consider a result "found".
 * LINK_QUALITY_THRESHOLD: Minimum score for inclusion in final cross-service results.
 * AUTO_SELECT_THRESHOLD: Above this, text search auto-selects without disambiguation.
 * CANDIDATE_MIN_CONFIDENCE: Minimum score to appear in disambiguation list.
 * ODESLI_CONFIDENCE: Confidence assigned to Odesli-sourced links.
 * CACHE_CONFIDENCE: Confidence assigned to DB-cached search results.
 * SEARCH_FALLBACK_CONFIDENCE: Confidence for generic "search on X" fallback links.
 */
export const MATCH_MIN_CONFIDENCE = 0.6;
export const LINK_QUALITY_THRESHOLD = 0.6;
const AUTO_SELECT_THRESHOLD = 0.9;
const CANDIDATE_MIN_CONFIDENCE = 0.4;
const MAX_CANDIDATES = 5;
const ODESLI_CONFIDENCE = 0.85;
const CACHE_CONFIDENCE = 0.8;
const SEARCH_FALLBACK_CONFIDENCE = 0.5;
const CACHE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Main entry point: accepts a URL or free-text query, returns cross-service links.
 */
export async function resolveQuery(input: string): Promise<ResolutionResult> {
  const trimmed = input.trim();

  if (isUrl(trimmed)) {
    // Validate URL for unsupported content types
    const validation = validateMusicUrl(trimmed);
    if (!validation.valid) {
      throw new ResolveError(
        validation.code,
        validation.message,
      );
    }
    return resolveUrl(stripTrackingParams(trimmed));
  }

  return resolveTextSearch(trimmed);
}

export async function resolveUrl(inputUrl: string): Promise<ResolutionResult> {
  const cleanUrl = stripTrackingParams(inputUrl);

  // 1. Cache lookup by URL
  const cached = await tryCache({ url: cleanUrl });
  if (cached) return cached;

  // 2. Identify which service the URL belongs to
  const sourceAdapter = identifyService(cleanUrl);
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
      return resolveUrlViaOdesli(cleanUrl);
    }
    throw error;
  }

  // 3b. Cache lookup by ISRC (in case same track was resolved via different URL)
  if (sourceTrack.isrc) {
    const cachedByIsrc = await tryCache({ isrc: sourceTrack.isrc });
    if (cachedByIsrc) return cachedByIsrc;
  }

  // 4. Resolve on all other services in parallel
  let links = await resolveAcrossServices(sourceTrack, sourceAdapter);

  // 5. Add the source service link
  links.unshift({
    service: sourceAdapter.id,
    displayName: sourceAdapter.displayName,
    url: sourceTrack.webUrl,
    confidence: 1.0,
    matchMethod: "isrc",
    externalId: sourceTrack.sourceId,
  });

  // 6. Gap-fill via Odesli for uncovered services
  links = await gapFillViaOdesli(sourceTrack.webUrl, links);

  return { sourceTrack, links };
}

export async function resolveTextSearch(query: string): Promise<ResolutionResult> {
  // Service search: try all available adapters
  const searchAdapters = adapters.filter((a) => a.isAvailable());
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
          if (cached) return cached;
        }

        let links = await resolveAcrossServices(result.track, adapter);
        links.unshift({
          service: adapter.id,
          displayName: adapter.displayName,
          url: result.track.webUrl,
          confidence: result.confidence,
          matchMethod: "search",
          externalId: result.track.sourceId,
        });

        // Gap-fill via Odesli for uncovered services
        links = await gapFillViaOdesli(result.track.webUrl, links);

        return { sourceTrack: result.track, links };
      }
    } catch {
      continue;
    }
  }

  throw new ResolveError("TRACK_NOT_FOUND", "No track found for the search query");
}

/**
 * Text search with disambiguation support.
 * Returns candidates for user selection when no single result has high enough confidence.
 * Auto-selects when top result confidence > 0.9.
 */
export async function resolveTextSearchWithDisambiguation(
  query: string,
): Promise<TextSearchResult> {
  log.debug("Resolver", "resolveTextSearchWithDisambiguation called with:", query);

  // Service search: try adapters that support searchTrackWithCandidates, then fall back
  const searchAdapters = adapters.filter((a) => a.isAvailable());

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
            if (cached) return { kind: "resolved", result: cached };
          }

          let links = await resolveAcrossServices(topCandidate.track, adapter);
          links.unshift({
            service: adapter.id,
            displayName: adapter.displayName,
            url: topCandidate.track.webUrl,
            confidence: topCandidate.confidence,
            matchMethod: "search",
            externalId: topCandidate.track.sourceId,
          });

          links = await gapFillViaOdesli(topCandidate.track.webUrl, links);

          return { kind: "resolved", result: { sourceTrack: topCandidate.track, links } };
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
          if (cached) return { kind: "resolved", result: cached };
        }

        let links = await resolveAcrossServices(result.track, adapter);
        links.unshift({
          service: adapter.id,
          displayName: adapter.displayName,
          url: result.track.webUrl,
          confidence: result.confidence,
          matchMethod: "search",
          externalId: result.track.sourceId,
        });

        links = await gapFillViaOdesli(result.track.webUrl, links);

        return { kind: "resolved", result: { sourceTrack: result.track, links } };
      }
    } catch {
      continue;
    }
  }

  throw new ResolveError("TRACK_NOT_FOUND", "No track found for the search query");
}

/**
 * Resolves a specific Spotify track by ID (after user selects from disambiguation list).
 */
export async function resolveSelectedCandidate(candidateId: string): Promise<ResolutionResult> {
  // candidateId format: "spotify:trackId"
  const [service, trackId] = candidateId.split(":", 2);
  if (!service || !trackId) {
    throw new ResolveError("INVALID_URL", "Invalid candidate ID format");
  }

  const adapter = adapters.find((a) => a.id === service);
  if (!adapter || !adapter.isAvailable()) {
    throw new ResolveError("SERVICE_DOWN", `${service} is not available`);
  }

  const sourceTrack = await adapter.getTrack(trackId);

  // Cache lookup by ISRC before full cross-service resolve
  if (sourceTrack.isrc) {
    const cached = await tryCache({ isrc: sourceTrack.isrc });
    if (cached) return cached;
  }

  let links = await resolveAcrossServices(sourceTrack, adapter);

  links.unshift({
    service: adapter.id,
    displayName: adapter.displayName,
    url: sourceTrack.webUrl,
    confidence: 1.0,
    matchMethod: "search",
    externalId: sourceTrack.sourceId,
  });

  // Gap-fill via Odesli for uncovered services
  links = await gapFillViaOdesli(sourceTrack.webUrl, links);

  return { sourceTrack, links };
}

async function resolveAcrossServices(
  sourceTrack: NormalizedTrack,
  excludeAdapter: ServiceAdapter,
): Promise<ResolvedLink[]> {
  const targetAdapters = adapters.filter(
    (a) => a.id !== excludeAdapter.id && a.isAvailable(),
  );

  // Resolve on each target service
  const results = await Promise.allSettled(
    targetAdapters.map((adapter) => resolveOnService(adapter, sourceTrack)),
  );

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
      log.error("Resolver", `[${adapter.id}] resolve failed: ${result.reason instanceof Error ? result.reason.message : result.reason}`);
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
  const coveredServices = new Set([
    excludeAdapter.id,
    ...links.map((l) => l.service),
  ]);

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

async function resolveOnService(
  adapter: ServiceAdapter,
  sourceTrack: NormalizedTrack,
): Promise<ResolvedLink | null> {
  // Strategy 1: ISRC lookup (most reliable)
  if (adapter.capabilities.supportsIsrc && sourceTrack.isrc) {
    // For YouTube, skip direct API and prefer Odesli (handled in resolveAcrossServices)
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
      };
    }
  }

  // Strategy 2: Text search (fallback)
  return resolveViaSearch(adapter, sourceTrack);
}

async function resolveViaSearch(
  adapter: ServiceAdapter,
  sourceTrack: NormalizedTrack,
): Promise<ResolvedLink | null> {
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
  };
}

async function resolveUrlViaOdesli(inputUrl: string): Promise<ResolutionResult> {
  const odesliResult = await resolveViaOdesli(inputUrl);

  if (!odesliResult.metadata) {
    throw new ResolveError("TRACK_NOT_FOUND", "Could not find track metadata");
  }

  // Create a normalized track from Odesli metadata
  const sourceTrack: NormalizedTrack = {
    sourceService: "spotify",
    sourceId: "",
    title: odesliResult.metadata.title ?? "Unknown Track",
    artists: odesliResult.metadata.artistName ? [odesliResult.metadata.artistName] : [],
    albumName: undefined,
    isrc: undefined,
    artworkUrl: odesliResult.metadata.thumbnailUrl,
    durationMs: undefined,
    webUrl: inputUrl,
  };

  // Convert Odesli links to ResolvedLinks
  const links: ResolvedLink[] = [];
  for (const [serviceId, link] of Object.entries(odesliResult.links)) {
    if (!isValidServiceId(serviceId) || !link) continue;
    links.push({
      service: serviceId,
      displayName: PLATFORM_CONFIG[serviceId].label,
      url: link.url,
      confidence: ODESLI_CONFIDENCE,
      matchMethod: "odesli",
    });
  }

  // Sort by confidence (highest first)
  links.sort((a, b) => b.confidence - a.confidence);

  return { sourceTrack, links };
}
