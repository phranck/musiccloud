/**
 * @file Artist resolve pipeline: URL -> cross-service link set.
 *
 * Parallel in structure to `resolver.ts` (tracks) and `album-resolver.ts`
 * (albums). The public entry points are `resolveArtistUrl` (when the
 * input is a streaming-service URL) and `resolveArtistTextSearch` (when
 * the input is a free-text artist name).
 *
 * ## Pipeline at a glance
 *
 * For a URL input the flow is:
 *
 * 1. Strip tracking params, try cache by URL, gap-fill on hit.
 * 2. If the URL belongs to a disabled plugin, throw `SERVICE_DISABLED`
 *    (more actionable than the generic `NOT_MUSIC_LINK`).
 * 3. Identify source adapter, extract artist ID, fetch source metadata.
 * 4. Try cache by normalized name (dedup across different source URLs
 *    for the same artist).
 * 5. Resolve on every other adapter that implements
 *    `artistCapabilities.supportsArtistSearch`, in parallel.
 * 6. Enrich missing `imageUrl` / `genres` from the cross-service
 *    results (Spotify preferred).
 * 7. Prepend the source link with confidence 1.0 and return.
 *
 * ## Confidence scoring (`calculateArtistNameConfidence`)
 *
 * Names match a case-normalized pair of rules before falling through
 * to fuzzy similarity:
 *
 * - Exact match (case/whitespace only): 0.95. Not 1.0 because two
 *   different real artists can share a name.
 * - "The" prefix stripped on both sides and equal: 0.9.
 * - `stringSimilarity > 0.85`: 0.85 (high-confidence fuzzy).
 * - `> 0.7` or substring either way: 0.75.
 * - Otherwise: `similarity * 0.7`, so fuzzy matches never exceed 0.7.
 *
 * Results below `MATCH_MIN_CONFIDENCE` are dropped at the per-service
 * level; results below `ARTIST_LINK_QUALITY_THRESHOLD` (0.6) are dropped
 * at the cross-service aggregate level. The two thresholds differ
 * because the per-service check runs against scored candidates while
 * the aggregate check decides what ends up in the user-visible link
 * list.
 *
 * ## YouTube Music derivation
 *
 * YouTube Music shares channel IDs with regular YouTube, so any
 * successful YouTube channel match mechanically yields a YouTube Music
 * link by hostname swap. This saves us from running a separate
 * YouTube-Music search (which would be redundant) and guarantees both
 * links stay in lockstep.
 *
 * ## Spotify-first enrichment
 *
 * Two artist fields get opportunistic enrichment from the cross-service
 * results when missing on the source:
 *
 * - `imageUrl`: Spotify's artist images are consistently high quality,
 *   so they are the first preference; any other link with an image is
 *   the fallback.
 * - `genres`: only Spotify exposes genre data reliably. If the source
 *   did not include genres but Spotify was matched, a targeted
 *   `getArtist(spotifyId)` call fetches them. Enrichment failure is
 *   swallowed (genres are optional).
 *
 * ## Text search prioritizes Spotify
 *
 * `resolveArtistTextSearch` iterates adapters with Spotify first because
 * Spotify's artist search endpoint gives the best name-based matches.
 * Other adapters serve as fallbacks if Spotify is down or not
 * configured.
 */
import { PLATFORM_CONFIG } from "@musiccloud/shared";
import { getRepository } from "../db/index.js";
import { CACHE_TTL_MS } from "../lib/config.js";
import { log } from "../lib/infra/logger.js";
import { stripTrackingParams } from "../lib/platform/url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import { stringSimilarity } from "../lib/resolve/normalize.js";
import { MATCH_MIN_CONFIDENCE } from "./constants.js";
import { collectArtistExternalIds } from "./external-ids.js";
import { filterDisabledLinks, getActiveAdapters, identifyServiceIncludingDisabled, isPluginEnabled } from "./index.js";
import type {
  ArtistMatchResult,
  ArtistSearchQuery,
  ExternalIdRecord,
  NormalizedArtist,
  ServiceAdapter,
  ServiceId,
} from "./types.js";
import { isValidServiceId } from "./types.js";

// --- Public Types ---

export interface ResolvedArtistLink {
  service: ServiceId;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: "search" | "cache";
  externalId?: string;
  imageUrl?: string;
}

export interface ArtistResolutionResult {
  sourceArtist: NormalizedArtist;
  links: ResolvedArtistLink[];
  artistId?: string;
  /**
   * External-id observations harvested across every adapter contacted
   * during the artist resolve. Persisted into `artist_external_ids`.
   * Always present; empty array when no IDs were collected (no current
   * adapter exposes artist-level MBIDs, but the channel is in place
   * for the upcoming MusicBrainz adapter).
   */
  externalIds: ExternalIdRecord[];
}

// --- Constants ---

export const ARTIST_LINK_QUALITY_THRESHOLD = 0.6;

// --- Cache helpers ---

function mapCachedArtistLinks(
  links: Array<{ service: string; url: string; confidence: number; matchMethod: string }>,
): ResolvedArtistLink[] {
  return links
    .filter((l) => isValidServiceId(l.service))
    .map((l) => ({
      service: l.service as ServiceId,
      displayName: PLATFORM_CONFIG[l.service as ServiceId].label,
      url: l.url,
      confidence: l.confidence,
      matchMethod: l.matchMethod as ResolvedArtistLink["matchMethod"],
    }));
}

async function tryArtistCache(lookup: { url?: string; name?: string }): Promise<ArtistResolutionResult | null> {
  try {
    const repo = await getRepository();
    let cached = lookup.url ? await repo.findArtistByUrl(lookup.url) : null;
    if (!cached && lookup.name) cached = await repo.findArtistByName(lookup.name);
    if (!cached) return null;

    const age = Date.now() - cached.updatedAt;
    if (age > CACHE_TTL_MS) {
      log.debug("ArtistResolver", `Cache expired: age=${Math.round(age / 3600000)}h`);
      return null;
    }

    const links = mapCachedArtistLinks(cached.links);
    log.debug("ArtistResolver", `Cache hit: ${links.length} links, age=${Math.round(age / 60000)}min`);

    return { sourceArtist: cached.artist, links, artistId: cached.artistId, externalIds: [] };
  } catch (error) {
    log.error("ArtistResolver", `Cache read failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * "Gap-fill" for a cached hit: runs artist search on every active
 * adapter that supports artist resolution and is not yet represented
 * in the cached link set. New links are persisted back onto the
 * cached row so the next cache hit is more complete.
 *
 * This exists so that enabling a new adapter after an artist was
 * already cached does not require a hard cache eviction: the next
 * request for that artist opportunistically picks up the new service.
 *
 * @param cached - cached artist result (already validated as fresh)
 * @returns the result augmented with links from newly-enabled services
 */
async function fillMissingArtistServices(cached: ArtistResolutionResult): Promise<ArtistResolutionResult> {
  const coveredServices = new Set(cached.links.map((l) => l.service));
  const active = await getActiveAdapters();

  const missingAdapters = active.filter(
    (a) => Boolean(a.artistCapabilities) && !coveredServices.has(a.id) && a.id !== cached.sourceArtist.sourceService,
  );

  if (missingAdapters.length === 0) return { ...cached, links: await filterDisabledLinks(cached.links) };

  log.debug("ArtistResolver", `Gap-filling ${missingAdapters.length} new services for cached artist`);

  const results = await Promise.allSettled(missingAdapters.map((a) => resolveArtistOnService(a, cached.sourceArtist)));

  const newLinks: ResolvedArtistLink[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      newLinks.push(result.value);
    }
  }

  if (newLinks.length === 0) return { ...cached, links: await filterDisabledLinks(cached.links) };

  if (cached.artistId) {
    try {
      const repo = await getRepository();
      await repo.addLinksToArtist(
        cached.artistId,
        newLinks.map((l) => ({
          service: l.service,
          url: l.url,
          confidence: l.confidence,
          matchMethod: l.matchMethod,
          externalId: l.externalId,
        })),
      );
    } catch (error) {
      log.error(
        "ArtistResolver",
        `Failed to persist gap-fill links: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  const allLinks = [...cached.links, ...newLinks].sort((a, b) => b.confidence - a.confidence);

  // Fill missing image from newly resolved links
  let { sourceArtist } = cached;
  if (!sourceArtist.imageUrl) {
    const imageLink = allLinks.find((l) => l.service === "spotify" && l.imageUrl) ?? allLinks.find((l) => l.imageUrl);
    if (imageLink?.imageUrl) {
      sourceArtist = { ...sourceArtist, imageUrl: imageLink.imageUrl };
    }
  }

  return {
    sourceArtist,
    links: await filterDisabledLinks(allLinks),
    artistId: cached.artistId,
    externalIds: collectArtistExternalIds(sourceArtist),
  };
}

// --- Per-service resolution ---

function calculateArtistNameConfidence(queryName: string, resultName: string): number {
  const queryLower = queryName.toLowerCase().trim();
  const resultLower = resultName.toLowerCase().trim();

  if (queryLower === resultLower) return 0.95;

  // Handle "The" prefix: "The Beatles" vs "Beatles"
  const stripThe = (s: string) => s.replace(/^the\s+/i, "").trim();
  if (stripThe(queryLower) === stripThe(resultLower)) return 0.9;

  const similarity = stringSimilarity(queryLower, resultLower);

  if (similarity > 0.85) return 0.85;
  if (similarity > 0.7) return 0.75;
  if (queryLower.includes(resultLower) || resultLower.includes(queryLower)) return 0.75;

  return similarity * 0.7;
}

async function resolveArtistOnService(
  adapter: ServiceAdapter,
  sourceArtist: NormalizedArtist,
): Promise<ResolvedArtistLink | null> {
  if (!adapter.artistCapabilities?.supportsArtistSearch || !adapter.searchArtist) return null;

  const query: ArtistSearchQuery = { name: sourceArtist.name };

  try {
    const result: ArtistMatchResult = await adapter.searchArtist(query);

    if (!result.found || !result.artist) return null;

    // Re-score using our own confidence model
    const confidence = calculateArtistNameConfidence(sourceArtist.name, result.artist.name);

    if (confidence < MATCH_MIN_CONFIDENCE) return null;

    return {
      service: adapter.id,
      displayName: adapter.displayName,
      url: result.artist.webUrl,
      confidence,
      matchMethod: "search",
      externalId: result.artist.sourceId,
      imageUrl: result.artist.imageUrl,
    };
  } catch (error) {
    log.debug("ArtistResolver", `[${adapter.id}] search failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

// --- Cross-service resolution ---

async function resolveArtistAcrossServices(
  sourceArtist: NormalizedArtist,
  excludeAdapter: ServiceAdapter,
): Promise<ResolvedArtistLink[]> {
  const active = await getActiveAdapters();
  const targetAdapters = active.filter((a) => a.id !== excludeAdapter.id && Boolean(a.artistCapabilities));

  const results = await Promise.allSettled(
    targetAdapters.map((adapter) => resolveArtistOnService(adapter, sourceArtist)),
  );

  const links: ResolvedArtistLink[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const adapter = targetAdapters[i];

    if (result.status === "fulfilled" && result.value) {
      log.debug("ArtistResolver", `[${adapter.id}] matched: confidence=${result.value.confidence}`);
      links.push(result.value);
    } else if (result.status === "fulfilled") {
      log.debug("ArtistResolver", `[${adapter.id}] no match found`);
    } else {
      log.error(
        "ArtistResolver",
        `[${adapter.id}] resolve failed: ${result.reason instanceof Error ? result.reason.message : result.reason}`,
      );
    }
  }

  // YouTube and YouTube Music share channel IDs, so an existing
  // YouTube match produces a valid YouTube Music URL by hostname swap.
  // Skipping the lookup avoids a redundant search call and keeps the
  // two links in lockstep.
  const youtubeLink = links.find((l) => l.service === "youtube");
  if (youtubeLink && !links.some((l) => l.service === "youtube-music")) {
    links.push({
      service: "youtube-music",
      displayName: "YouTube Music",
      url: youtubeLink.url.replace("www.youtube.com", "music.youtube.com"),
      confidence: youtubeLink.confidence,
      matchMethod: youtubeLink.matchMethod,
      externalId: youtubeLink.externalId,
    });
  }

  links.sort((a, b) => b.confidence - a.confidence);

  return links.filter((l) => l.confidence >= ARTIST_LINK_QUALITY_THRESHOLD);
}

// --- Identify artist service ---

async function identifyArtistService(url: string): Promise<ServiceAdapter | undefined> {
  const active = await getActiveAdapters();
  return active.find((a) => Boolean(a.detectArtistUrl) && a.detectArtistUrl?.(url) !== null);
}

// --- Main entry points ---

/**
 * Main URL entry point. See the file header for the full pipeline.
 *
 * @param inputUrl - streaming-service URL identifying an artist
 * @returns resolved result with source plus cross-service links
 * @throws `ResolveError("SERVICE_DISABLED")` if the URL belongs to a currently-disabled plugin
 * @throws `ResolveError("NOT_MUSIC_LINK")` if no adapter recognizes the URL shape
 * @throws `ResolveError("INVALID_URL")` if the adapter cannot extract an artist ID
 * @throws `ResolveError("SERVICE_DOWN")` if the source adapter fails to fetch metadata
 */
export async function resolveArtistUrl(inputUrl: string): Promise<ArtistResolutionResult> {
  const cleanUrl = stripTrackingParams(inputUrl);

  // 1. Cache lookup by URL
  const cached = await tryArtistCache({ url: cleanUrl });
  if (cached) return fillMissingArtistServices(cached);

  // 2. Identify which service the URL belongs to. Check disabled plugins
  //    first so a known-but-toggled-off source surfaces SERVICE_DISABLED
  //    instead of the generic NOT_MUSIC_LINK.
  const identified = await identifyServiceIncludingDisabled(cleanUrl);
  if (identified?.detectArtistUrl?.(cleanUrl) && !(await isPluginEnabled(identified.id))) {
    throw new ResolveError("SERVICE_DISABLED", undefined, { service: identified.id });
  }
  const sourceAdapter = await identifyArtistService(cleanUrl);
  if (!sourceAdapter || !sourceAdapter.getArtist || !sourceAdapter.detectArtistUrl) {
    throw new ResolveError("NOT_MUSIC_LINK", "Unrecognized artist URL");
  }

  const artistId = sourceAdapter.detectArtistUrl(cleanUrl);
  if (!artistId) {
    throw new ResolveError("INVALID_URL", "Could not extract artist ID from URL");
  }

  // 3. Fetch artist metadata
  let sourceArtist: NormalizedArtist;
  try {
    sourceArtist = await sourceAdapter.getArtist(artistId);
  } catch (error) {
    if (error instanceof ResolveError) throw error;
    throw new ResolveError(
      "SERVICE_DOWN",
      `Failed to fetch artist from ${sourceAdapter.id}: ${error instanceof Error ? error.message : error}`,
    );
  }

  // 4. Cache lookup by name (dedup: same artist from different URL)
  const cachedByName = await tryArtistCache({ name: sourceArtist.name });
  if (cachedByName) return fillMissingArtistServices(cachedByName);

  // 5. Resolve on all other services in parallel
  const links = await resolveArtistAcrossServices(sourceArtist, sourceAdapter);

  // 6. If source artist has no image, use image from a cross-service result
  if (!sourceArtist.imageUrl) {
    const imageLink = links.find((l) => l.service === "spotify" && l.imageUrl) ?? links.find((l) => l.imageUrl);
    if (imageLink?.imageUrl) {
      sourceArtist = { ...sourceArtist, imageUrl: imageLink.imageUrl };
    }
  }

  // 7. If source artist has no genres, try to get them from Spotify result
  if (!sourceArtist.genres || sourceArtist.genres.length === 0) {
    const spotifyLink = links.find((l) => l.service === "spotify");
    if (spotifyLink?.externalId && sourceAdapter.id !== "spotify") {
      try {
        const active = await getActiveAdapters();
        const spotifyAdapter = active.find((a) => a.id === "spotify");
        if (spotifyAdapter?.getArtist) {
          const spotifyArtist = await spotifyAdapter.getArtist(spotifyLink.externalId);
          if (spotifyArtist.genres && spotifyArtist.genres.length > 0) {
            sourceArtist = { ...sourceArtist, genres: spotifyArtist.genres };
          }
        }
      } catch {
        // ignore - genres are optional enrichment
      }
    }
  }

  // 8. Add source service link
  links.unshift({
    service: sourceAdapter.id,
    displayName: sourceAdapter.displayName,
    url: sourceArtist.webUrl,
    confidence: 1.0,
    matchMethod: "search",
    externalId: sourceArtist.sourceId,
  });

  return {
    sourceArtist,
    links,
    externalIds: collectArtistExternalIds(sourceArtist),
  };
}

/**
 * Text-search entry point. Iterates adapters in Spotify-first order (see
 * file header for why). First adapter with a `found` match wins; the
 * result then goes through the same cache-by-name and cross-service
 * enrichment as the URL path.
 *
 * @param query - free-text artist name
 * @returns resolved artist result
 * @throws `ResolveError("TRACK_NOT_FOUND")` if no adapter finds the artist
 */
export async function resolveArtistTextSearch(query: string): Promise<ArtistResolutionResult> {
  const active = await getActiveAdapters();
  const searchAdapters = active.filter(
    (a) => Boolean(a.artistCapabilities?.supportsArtistSearch) && Boolean(a.searchArtist),
  );

  // Prioritize Spotify
  const spotifyFirst = [
    ...searchAdapters.filter((a) => a.id === "spotify"),
    ...searchAdapters.filter((a) => a.id !== "spotify"),
  ];

  for (const adapter of spotifyFirst) {
    try {
      const result = await adapter.searchArtist?.({ name: query });

      if (result?.found && result.artist) {
        // Cache lookup by name before full cross-service resolve
        const cached = await tryArtistCache({ name: result.artist.name });
        if (cached) return fillMissingArtistServices(cached);

        let sourceArtist = result.artist;
        const links = await resolveArtistAcrossServices(sourceArtist, adapter);

        if (!sourceArtist.imageUrl) {
          const imageLink = links.find((l) => l.service === "spotify" && l.imageUrl) ?? links.find((l) => l.imageUrl);
          if (imageLink?.imageUrl) {
            sourceArtist = { ...sourceArtist, imageUrl: imageLink.imageUrl };
          }
        }

        links.unshift({
          service: adapter.id,
          displayName: adapter.displayName,
          url: sourceArtist.webUrl,
          confidence: result.confidence,
          matchMethod: "search",
          externalId: sourceArtist.sourceId,
        });

        return {
          sourceArtist,
          links,
          externalIds: collectArtistExternalIds(sourceArtist),
        };
      }
    } catch {
      // try next adapter
    }
  }

  throw new ResolveError("TRACK_NOT_FOUND", "No artist found for the search query");
}
