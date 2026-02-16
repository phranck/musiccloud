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
export const LINK_QUALITY_THRESHOLD = 0.7;
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
        validation.code as ErrorCode,
        validation.message,
      );
    }
    return resolveUrl(stripTrackingParams(trimmed));
  }

  return resolveTextSearch(trimmed);
}

export async function resolveUrl(inputUrl: string): Promise<ResolutionResult> {
  const cleanUrl = stripTrackingParams(inputUrl);

  // 1. DB-First: Check if we have this URL cached
  log.debug("Resolver", "DB-First: Checking for cached URL...");
  const repo = await getRepository();
  const cached = await repo.findTrackByUrl(cleanUrl);
  if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
    log.debug("Resolver", "Cache hit (fresh)! Returning cached result");
    return { sourceTrack: cached.track, links: mapCachedLinks(cached.links) };
  }
  if (cached) {
    log.debug("Resolver", "Cache hit but stale, will re-resolve");
  }

  // 2. Identify which service the URL belongs to
  const sourceAdapter = identifyService(cleanUrl);
  if (!sourceAdapter) {
    throw new ResolveError("NOT_MUSIC_LINK", "Unrecognized music service URL");
  }

  const trackId = sourceAdapter.detectUrl(cleanUrl);
  if (!trackId) {
    throw new ResolveError("INVALID_URL", "Could not extract track ID from URL");
  }

  // 3. Check DB by ISRC if we have it
  let staleCached = cached;
  if (sourceAdapter.capabilities.supportsIsrc) {
    log.debug("Resolver", "Trying to fetch track metadata for ISRC lookup...");
    try {
      const sourceTrack = await sourceAdapter.getTrack(trackId);
      if (sourceTrack.isrc) {
        const cachedByIsrc = await repo.findTrackByIsrc(sourceTrack.isrc);
        if (cachedByIsrc && Date.now() - cachedByIsrc.updatedAt < CACHE_TTL_MS) {
          log.debug("Resolver", "Cache hit by ISRC (fresh)! Returning cached result");
          return { sourceTrack: cachedByIsrc.track, links: mapCachedLinks(cachedByIsrc.links) };
        }
        if (cachedByIsrc) {
          staleCached = cachedByIsrc;
          log.debug("Resolver", "ISRC cache hit but stale, will re-resolve");
        }
      }
    } catch (error) {
      // Continue with normal flow if metadata fetch fails
      log.debug("Resolver", "Metadata fetch failed, continuing with normal flow");
    }
  }

  // 4. Fetch metadata and resolve across services (with stale fallback on failure)
  try {
    let sourceTrack: NormalizedTrack;
    try {
      sourceTrack = await sourceAdapter.getTrack(trackId);
    } catch (error) {
      if (!sourceAdapter.isAvailable()) {
        return resolveUrlViaOdesli(cleanUrl);
      }
      throw error;
    }

    // 5. Resolve on all other services in parallel
    const links = await resolveAcrossServices(sourceTrack, sourceAdapter);

    // 6. Add the source service link
    links.unshift({
      service: sourceAdapter.id,
      displayName: sourceAdapter.displayName,
      url: sourceTrack.webUrl,
      confidence: 1.0,
      matchMethod: "isrc",
    });

    return { sourceTrack, links };
  } catch (error) {
    if (staleCached) {
      log.error("Resolver", "Re-resolve failed, returning stale cache");
      await repo.updateTrackTimestamp(staleCached.trackId);
      return { sourceTrack: staleCached.track, links: mapCachedLinks(staleCached.links) };
    }
    throw error;
  }
}

export async function resolveTextSearch(query: string): Promise<ResolutionResult> {
  // 1. DB-First: Check if we have similar tracks cached
  log.debug("Resolver", "resolveTextSearch - DB-First: Searching FTS5...");
  const repo = await getRepository();
  const cachedTracks = await repo.findTracksByTextSearch(query, 1);
  let staleIsrcMatch: Awaited<ReturnType<typeof repo.findTrackByIsrc>> = null;
  if (cachedTracks.length > 0) {
    log.debug("Resolver", "DB cache hit for text search!");
    const track = cachedTracks[0];
    const isrcMatch = track.isrc ? await repo.findTrackByIsrc(track.isrc) : null;
    if (isrcMatch && Date.now() - isrcMatch.updatedAt < CACHE_TTL_MS) {
      return { sourceTrack: track, links: mapCachedLinks(isrcMatch.links) };
    }
    if (isrcMatch) {
      staleIsrcMatch = isrcMatch;
      log.debug("Resolver", "Text search cache hit but stale, will re-resolve");
    }
  }

  // 2. Service search: try all available adapters with search capability
  const searchAdapters = adapters.filter((a) => a.isAvailable());
  for (const adapter of searchAdapters) {
    try {
      const result = await adapter.searchTrack({
        title: query,
        artist: query,
      });

      if (result.found && result.track) {
        const links = await resolveAcrossServices(result.track, adapter);
        links.unshift({
          service: adapter.id,
          displayName: adapter.displayName,
          url: result.track.webUrl,
          confidence: result.confidence,
          matchMethod: "search",
        });
        return { sourceTrack: result.track, links };
      }
    } catch {
      continue;
    }
  }

  // All service searches failed: return stale data if available
  if (staleIsrcMatch) {
    log.debug("Resolver", "All service searches failed, returning stale cache");
    await repo.updateTrackTimestamp(staleIsrcMatch.trackId);
    return { sourceTrack: staleIsrcMatch.track, links: mapCachedLinks(staleIsrcMatch.links) };
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

  // 1. DB-First: Check if we have similar tracks cached
  log.debug("Resolver", "DB-First: Searching FTS5 for similar tracks...");
  const repo = await getRepository();
  const cachedTracks = await repo.findTracksByTextSearch(query, MAX_CANDIDATES);
  if (cachedTracks.length > 0) {
    log.debug("Resolver", "DB cache hit! Found", cachedTracks.length, "cached tracks");
    // Return as candidates (user can select or we can auto-select if high confidence)
    const candidates: SearchCandidate[] = cachedTracks
      .slice(0, MAX_CANDIDATES)
      .map((t) => ({
        id: `${t.sourceService}:${t.sourceId}`,
        title: t.title,
        artists: t.artists,
        albumName: t.albumName,
        artworkUrl: t.artworkUrl,
        durationMs: t.durationMs,
        confidence: CACHE_CONFIDENCE,
      }));

    return { kind: "disambiguation", candidates };
  }

  // 2. Service search: try adapters that support searchTrackWithCandidates, then fall back
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
          const links = await resolveAcrossServices(topCandidate.track, adapter);
          links.unshift({
            service: adapter.id,
            displayName: adapter.displayName,
            url: topCandidate.track.webUrl,
            confidence: topCandidate.confidence,
            matchMethod: "search",
          });
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
        const links = await resolveAcrossServices(result.track, adapter);
        links.unshift({
          service: adapter.id,
          displayName: adapter.displayName,
          url: result.track.webUrl,
          confidence: result.confidence,
          matchMethod: "search",
        });
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
  const links = await resolveAcrossServices(sourceTrack, adapter);

  links.unshift({
    service: adapter.id,
    displayName: adapter.displayName,
    url: sourceTrack.webUrl,
    confidence: 1.0,
    matchMethod: "search",
  });

  return { sourceTrack, links };
}

async function resolveAcrossServices(
  sourceTrack: NormalizedTrack,
  excludeAdapter: ServiceAdapter,
): Promise<ResolvedLink[]> {
  const targetAdapters = adapters.filter(
    (a) => a.id !== excludeAdapter.id && a.isAvailable(),
  );

  // Odesli disabled - relying on own adapters only
  // const odesliPromise = resolveViaOdesli(sourceTrack.webUrl).catch((error) => {
  //   log.error("Resolver", `Odesli failed: ${error instanceof Error ? error.message : error}`);
  //   return null;
  // });

  // Resolve on each target service
  const results = await Promise.allSettled(
    targetAdapters.map((adapter) => resolveOnService(adapter, sourceTrack)),
  );

  const links: ResolvedLink[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const adapter = targetAdapters[i];

    if (result.status === "fulfilled" && result.value) {
      links.push(result.value);
    } else if (result.status === "rejected") {
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
