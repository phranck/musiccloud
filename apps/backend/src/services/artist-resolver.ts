import { PLATFORM_CONFIG } from "@musiccloud/shared";
import { getRepository } from "../db/index.js";
import { CACHE_TTL_MS } from "../lib/config.js";
import { log } from "../lib/infra/logger.js";
import { stripTrackingParams } from "../lib/platform/url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import { stringSimilarity } from "../lib/resolve/normalize.js";
import { MATCH_MIN_CONFIDENCE } from "./constants.js";
import { adapters } from "./index.js";
import type { ArtistMatchResult, ArtistSearchQuery, NormalizedArtist, ServiceAdapter, ServiceId } from "./types.js";
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

    return { sourceArtist: cached.artist, links, artistId: cached.artistId };
  } catch (error) {
    log.error("ArtistResolver", `Cache read failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function fillMissingArtistServices(cached: ArtistResolutionResult): Promise<ArtistResolutionResult> {
  const coveredServices = new Set(cached.links.map((l) => l.service));

  const missingAdapters = adapters.filter(
    (a): a is ServiceAdapter =>
      Boolean(a?.isAvailable?.()) &&
      Boolean(a.artistCapabilities) &&
      !coveredServices.has(a.id) &&
      a.id !== cached.sourceArtist.sourceService,
  );

  if (missingAdapters.length === 0) return cached;

  log.debug("ArtistResolver", `Gap-filling ${missingAdapters.length} new services for cached artist`);

  const results = await Promise.allSettled(missingAdapters.map((a) => resolveArtistOnService(a, cached.sourceArtist)));

  const newLinks: ResolvedArtistLink[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      newLinks.push(result.value);
    }
  }

  if (newLinks.length === 0) return cached;

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

  return { sourceArtist, links: allLinks, artistId: cached.artistId };
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
  const targetAdapters = adapters.filter(
    (a): a is ServiceAdapter =>
      Boolean(a?.isAvailable?.()) && a.id !== excludeAdapter.id && Boolean(a.artistCapabilities),
  );

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

  // Derive YouTube Music link from YouTube channel
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

function identifyArtistService(url: string): ServiceAdapter | undefined {
  return adapters.find((a): a is ServiceAdapter => {
    if (!a?.isAvailable?.() || !a.detectArtistUrl) return false;
    return a.detectArtistUrl(url) !== null;
  });
}

// --- Main entry points ---

/** Resolve an artist URL: fetch metadata from source, then find on all other services. */
export async function resolveArtistUrl(inputUrl: string): Promise<ArtistResolutionResult> {
  const cleanUrl = stripTrackingParams(inputUrl);

  // 1. Cache lookup by URL
  const cached = await tryArtistCache({ url: cleanUrl });
  if (cached) return fillMissingArtistServices(cached);

  // 2. Identify which service the URL belongs to
  const sourceAdapter = identifyArtistService(cleanUrl);
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
        const spotifyAdapter = adapters.find((a) => a.id === "spotify");
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

  return { sourceArtist, links };
}

/** Text search for artists. Tries Spotify first (best artist search API). */
export async function resolveArtistTextSearch(query: string): Promise<ArtistResolutionResult> {
  const searchAdapters = adapters.filter(
    (a): a is ServiceAdapter =>
      Boolean(a?.isAvailable?.()) && Boolean(a.artistCapabilities?.supportsArtistSearch) && Boolean(a.searchArtist),
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

        return { sourceArtist, links };
      }
    } catch {
      // try next adapter
    }
  }

  throw new ResolveError("TRACK_NOT_FOUND", "No artist found for the search query");
}
