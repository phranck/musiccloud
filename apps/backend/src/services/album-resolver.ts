import { PLATFORM_CONFIG } from "@musiccloud/shared";
import { getRepository } from "../db/index.js";
import { CACHE_TTL_MS } from "../lib/config.js";
import { log } from "../lib/infra/logger.js";
import { stripTrackingParams } from "../lib/platform/url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import { getActiveAdapters } from "./index.js";
import type { AlbumMatchResult, AlbumSearchQuery, NormalizedAlbum, ServiceAdapter, ServiceId } from "./types.js";
import { isValidServiceId } from "./types.js";

// ─── Public Types ───────────────────────────────────────────────────────────

export interface ResolvedAlbumLink {
  service: ServiceId;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: "upc" | "isrc-inference" | "search" | "cache";
  externalId?: string;
  /** Preview URL of the most popular track from this service (Deezer only) */
  topTrackPreviewUrl?: string;
  /** Artwork URL from the resolved album (used for artwork fallback) */
  artworkUrl?: string;
}

export interface AlbumResolutionResult {
  sourceAlbum: NormalizedAlbum;
  links: ResolvedAlbumLink[];
  albumId?: string; // present when loaded from cache
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const ALBUM_LINK_QUALITY_THRESHOLD = 0.6;
const ISRC_INFERENCE_MIN_MATCH_FRACTION = 0.33; // ≥1/3 of sampled tracks must match
const ISRC_SAMPLE_SIZE = 5; // How many tracks to sample for ISRC inference

// ─── Cache helpers ────────────────────────────────────────────────────────────

function mapCachedAlbumLinks(
  links: Array<{ service: string; url: string; confidence: number; matchMethod: string }>,
): ResolvedAlbumLink[] {
  return links
    .filter((l) => isValidServiceId(l.service))
    .map((l) => ({
      service: l.service as ServiceId,
      displayName: PLATFORM_CONFIG[l.service as ServiceId].label,
      url: l.url,
      confidence: l.confidence,
      matchMethod: l.matchMethod as ResolvedAlbumLink["matchMethod"],
    }));
}

async function tryAlbumCache(lookup: { url?: string; upc?: string }): Promise<AlbumResolutionResult | null> {
  try {
    const repo = await getRepository();
    let cached = lookup.url ? await repo.findAlbumByUrl(lookup.url) : null;
    if (!cached && lookup.upc) cached = await repo.findAlbumByUpc(lookup.upc);
    if (!cached) return null;

    const age = Date.now() - cached.updatedAt;
    if (age > CACHE_TTL_MS) {
      log.debug("AlbumResolver", `Cache expired: age=${Math.round(age / 3600000)}h`);
      return null;
    }

    const links = mapCachedAlbumLinks(cached.links);
    log.debug("AlbumResolver", `Cache hit: ${links.length} links, age=${Math.round(age / 60000)}min`);

    return { sourceAlbum: cached.album, links, albumId: cached.albumId };
  } catch (error) {
    log.error("AlbumResolver", `Cache read failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function fillMissingAlbumServices(cached: AlbumResolutionResult): Promise<AlbumResolutionResult> {
  const coveredServices = new Set(cached.links.map((l) => l.service));
  const active = await getActiveAdapters();

  const missingAdapters = active.filter(
    (a) => Boolean(a.albumCapabilities) && !coveredServices.has(a.id) && a.id !== cached.sourceAlbum.sourceService,
  );

  if (missingAdapters.length === 0) return cached;

  log.debug("AlbumResolver", `Gap-filling ${missingAdapters.length} new services for cached album`);

  const results = await Promise.allSettled(missingAdapters.map((a) => resolveAlbumOnService(a, cached.sourceAlbum)));

  const newLinks: ResolvedAlbumLink[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      newLinks.push(result.value);
    }
  }

  if (newLinks.length === 0) return cached;

  if (cached.albumId) {
    try {
      const repo = await getRepository();
      await repo.addLinksToAlbum(
        cached.albumId,
        newLinks.map((l) => ({
          service: l.service,
          url: l.url,
          confidence: l.confidence,
          matchMethod: l.matchMethod,
          externalId: l.externalId,
        })),
      );
    } catch (error) {
      log.error("AlbumResolver", `Failed to persist gap-fill links: ${error instanceof Error ? error.message : error}`);
    }
  }

  const allLinks = [...cached.links, ...newLinks].sort((a, b) => b.confidence - a.confidence);

  // Fill missing artwork from newly resolved links
  let { sourceAlbum } = cached;
  if (!sourceAlbum.artworkUrl) {
    const artworkLink =
      allLinks.find((l) => l.service === "spotify" && l.artworkUrl) ??
      allLinks.find((l) => l.service === "apple-music" && l.artworkUrl) ??
      allLinks.find((l) => l.artworkUrl);
    if (artworkLink?.artworkUrl) {
      sourceAlbum = { ...sourceAlbum, artworkUrl: artworkLink.artworkUrl };
    }
  }

  return { sourceAlbum, links: allLinks, albumId: cached.albumId };
}

// ─── ISRC-based album inference ───────────────────────────────────────────────

/**
 * Infer album on a target service using track ISRCs.
 *
 * Strategy:
 * 1. Sample up to ISRC_SAMPLE_SIZE tracks from the source album.
 * 2. Call adapter.findByIsrc() (existing track method) for each.
 * 3. Collect the album names reported by the tracks found on the target.
 * 4. If ≥33% of sampled tracks resolve to the same album, use that album's URL.
 *
 * This reuses existing ISRC infrastructure without requiring album-specific API support.
 */
async function inferAlbumViaIsrc(
  adapter: ServiceAdapter,
  sourceAlbum: NormalizedAlbum,
): Promise<ResolvedAlbumLink | null> {
  if (!sourceAlbum.tracks || sourceAlbum.tracks.length === 0) return null;

  const tracksWithIsrc = sourceAlbum.tracks.filter((t) => t.isrc);
  if (tracksWithIsrc.length === 0) return null;

  // Sample evenly: first, middle, last, etc.
  const step = Math.max(1, Math.floor(tracksWithIsrc.length / ISRC_SAMPLE_SIZE));
  const sampled = tracksWithIsrc.filter((_, i) => i % step === 0).slice(0, ISRC_SAMPLE_SIZE);

  // Each hit captures the original (mixed-case) album name + the track URL
  // we can fall back to if the follow-up searchAlbum lookup fails.
  const albumHits: Map<string, { albumName: string; trackUrl: string; count: number }> = new Map();

  const results = await Promise.allSettled(
    sampled.map((t) => (t.isrc ? adapter.findByIsrc(t.isrc) : Promise.resolve(null))),
  );

  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const track = r.value;
    if (!track.albumName) continue;
    const key = track.albumName.toLowerCase().trim();
    const existing = albumHits.get(key);
    if (existing) {
      existing.count++;
    } else {
      albumHits.set(key, { albumName: track.albumName, trackUrl: track.webUrl, count: 1 });
    }
  }

  if (albumHits.size === 0) return null;

  // Pick the most common album name
  const [, best] = [...albumHits.entries()].reduce((a, b) => (b[1].count > a[1].count ? b : a));
  const matchFraction = best.count / sampled.length;

  log.debug(
    "AlbumResolver",
    `[${adapter.id}] ISRC inference: "${best.albumName}" matched ${best.count}/${sampled.length} tracks`,
  );

  if (matchFraction < ISRC_INFERENCE_MIN_MATCH_FRACTION) return null;

  const confidence = 0.7 + matchFraction * 0.2; // 0.7–0.9 range

  // Look up the matched album via resolveAlbumViaSearch to get a proper album
  // URL, top-track preview URL, and artwork. The previous derived-URL approach
  // (replace `/track/` with `/album/`) only works on services where track id
  // == album id (e.g. Spotify) and produces broken links elsewhere (Deezer
  // uses different ids). It also missed `topTrackPreviewUrl`, which is what
  // the share page's preview player needs.
  //
  // We feed the matched album name (not the source title) into the search and
  // override the confidence/matchMethod with our ISRC-derived values, since
  // ISRC verification is stronger than text-similarity. resolveAlbumViaSearch
  // also performs a getAlbum follow-up when the search response lacks tracks
  // (Deezer's /search/album does), so previews come through.
  //
  // Caching: the resolved link (incl. preview URL) is persisted by
  // persistAlbumWithLinks. Future resolves of the same source URL hit the DB
  // cache (CACHE_TTL_MS = 48h) and skip every external API call here.
  try {
    const link = await resolveAlbumViaSearch(adapter, { ...sourceAlbum, title: best.albumName });
    if (link) {
      return { ...link, confidence, matchMethod: "isrc-inference" };
    }
  } catch (err) {
    log.debug(
      "AlbumResolver",
      `[${adapter.id}] ISRC-inference follow-up search failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  // Fallback: at least return a track URL that actually works. Better than
  // synthesising a broken /album/{trackId} URL — the user lands on the track
  // and can navigate to the album from there.
  return {
    service: adapter.id,
    displayName: adapter.displayName,
    url: best.trackUrl,
    confidence,
    matchMethod: "isrc-inference",
  };
}

// ─── Per-service resolution ───────────────────────────────────────────────────

/**
 * Try to find an album on a single target service.
 *
 * Strategy order:
 * 1. UPC lookup (most reliable, confidence 1.0)
 * 2. ISRC-based inference (track ISRCs → derive album, confidence 0.7–0.9)
 * 3. Text search (title + artist, confidence varies)
 */
async function resolveAlbumOnService(
  adapter: ServiceAdapter,
  sourceAlbum: NormalizedAlbum,
): Promise<ResolvedAlbumLink | null> {
  // Strategy 1: UPC lookup
  if (adapter.albumCapabilities?.supportsUpc && adapter.findAlbumByUpc && sourceAlbum.upc) {
    try {
      const album = await adapter.findAlbumByUpc(sourceAlbum.upc);
      if (album) {
        return {
          service: adapter.id,
          displayName: adapter.displayName,
          url: album.webUrl,
          confidence: 1.0,
          matchMethod: "upc",
          externalId: album.sourceId,
          topTrackPreviewUrl: album.topTrackPreviewUrl,
          artworkUrl: album.artworkUrl,
        };
      }
    } catch (error) {
      log.debug(
        "AlbumResolver",
        `[${adapter.id}] UPC lookup failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  // Strategy 2: ISRC-based inference (if source has track listing with ISRCs)
  if (sourceAlbum.tracks && sourceAlbum.tracks.length > 0) {
    try {
      const inferred = await inferAlbumViaIsrc(adapter, sourceAlbum);
      if (inferred) return inferred;
    } catch (error) {
      log.debug(
        "AlbumResolver",
        `[${adapter.id}] ISRC inference failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  // Strategy 3: Text search
  return resolveAlbumViaSearch(adapter, sourceAlbum);
}

async function resolveAlbumViaSearch(
  adapter: ServiceAdapter,
  sourceAlbum: NormalizedAlbum,
): Promise<ResolvedAlbumLink | null> {
  if (!adapter.albumCapabilities?.supportsAlbumSearch || !adapter.searchAlbum) return null;

  const query: AlbumSearchQuery = {
    title: sourceAlbum.title,
    artist: sourceAlbum.artists[0] ?? "",
    year: sourceAlbum.releaseDate?.slice(0, 4),
    totalTracks: sourceAlbum.totalTracks,
  };

  const result: AlbumMatchResult = await adapter.searchAlbum(query);

  if (!result.found || !result.album) return null;

  // Search endpoints (e.g. Deezer /search/album) don't return tracks, so topTrackPreviewUrl
  // is missing. Fetch full album details when the adapter supports it.
  let album = result.album;
  if (!album.topTrackPreviewUrl && adapter.getAlbum && album.sourceId) {
    try {
      const full = await adapter.getAlbum(album.sourceId);
      if (full.topTrackPreviewUrl) album = full;
    } catch {
      // ignore — use search result as-is
    }
  }

  return {
    service: adapter.id,
    displayName: adapter.displayName,
    url: album.webUrl,
    confidence: result.confidence,
    matchMethod: result.matchMethod as ResolvedAlbumLink["matchMethod"],
    externalId: album.sourceId,
    topTrackPreviewUrl: album.topTrackPreviewUrl,
    artworkUrl: album.artworkUrl,
  };
}

// ─── Cross-service resolution ─────────────────────────────────────────────────

async function resolveAlbumAcrossServices(
  sourceAlbum: NormalizedAlbum,
  excludeAdapter: ServiceAdapter,
): Promise<ResolvedAlbumLink[]> {
  const active = await getActiveAdapters();
  const targetAdapters = active.filter((a) => a.id !== excludeAdapter.id && Boolean(a.albumCapabilities));

  const results = await Promise.allSettled(
    targetAdapters.map((adapter) => resolveAlbumOnService(adapter, sourceAlbum)),
  );

  const links: ResolvedAlbumLink[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const adapter = targetAdapters[i];

    if (result.status === "fulfilled" && result.value) {
      log.debug("AlbumResolver", `[${adapter.id}] matched: confidence=${result.value.confidence}`);
      links.push(result.value);
    } else if (result.status === "fulfilled") {
      log.debug("AlbumResolver", `[${adapter.id}] no match found`);
    } else {
      log.error(
        "AlbumResolver",
        `[${adapter.id}] resolve failed: ${result.reason instanceof Error ? result.reason.message : result.reason}`,
      );
    }
  }

  // Task 2.4: Derive YouTube Music album link from YouTube Music playlist result
  // YouTube Music album URLs use the OLAK5uy_ playlist format, no separate derivation needed.
  // The YouTube Music adapter (if present) handles this natively.
  // If YouTube found a result via its playlist endpoint, also add it as youtube-music link.
  const youtubeLink = links.find((l) => l.service === "youtube");
  if (youtubeLink && !links.some((l) => l.service === "youtube-music")) {
    // YouTube album playlists map directly to YouTube Music
    const playlistMatch = /[?&]list=(OLAK5uy_[^&]+)/.exec(youtubeLink.url);
    if (playlistMatch) {
      links.push({
        service: "youtube-music",
        displayName: "YouTube Music",
        url: `https://music.youtube.com/playlist?list=${playlistMatch[1]}`,
        confidence: youtubeLink.confidence,
        matchMethod: youtubeLink.matchMethod,
        externalId: youtubeLink.externalId,
      });
    }
  }

  // Sort by confidence (highest first)
  links.sort((a, b) => b.confidence - a.confidence);

  // Filter out low-confidence matches
  return links.filter((l) => l.confidence >= ALBUM_LINK_QUALITY_THRESHOLD);
}

// ─── Identify album service ───────────────────────────────────────────────────

async function identifyAlbumService(url: string): Promise<ServiceAdapter | undefined> {
  const active = await getActiveAdapters();
  return active.find((a) => Boolean(a.detectAlbumUrl) && a.detectAlbumUrl?.(url) !== null);
}

// ─── Main entry points ────────────────────────────────────────────────────────

/** Resolve an album URL: fetch metadata from source, then find on all other services. */
export async function resolveAlbumUrl(inputUrl: string): Promise<AlbumResolutionResult> {
  const cleanUrl = stripTrackingParams(inputUrl);

  // 1. Cache lookup by URL
  const cached = await tryAlbumCache({ url: cleanUrl });
  if (cached) return fillMissingAlbumServices(cached);

  // 2. Identify which service the URL belongs to
  const sourceAdapter = await identifyAlbumService(cleanUrl);
  if (!sourceAdapter || !sourceAdapter.getAlbum || !sourceAdapter.detectAlbumUrl) {
    throw new ResolveError("NOT_MUSIC_LINK", "Unrecognized album URL");
  }

  const albumId = sourceAdapter.detectAlbumUrl(cleanUrl);
  if (!albumId) {
    throw new ResolveError("INVALID_URL", "Could not extract album ID from URL");
  }

  // 3. Fetch album metadata
  let sourceAlbum: NormalizedAlbum;
  try {
    sourceAlbum = await sourceAdapter.getAlbum(albumId);
  } catch (error) {
    // Preserve the adapter's MC code (e.g. MC-API-1404, MC-AUTH-2401) so the
    // user sees the specific reason rather than a generic "service down".
    if (error instanceof ResolveError) throw error;
    throw new ResolveError(
      "SERVICE_DOWN",
      `Failed to fetch album from ${sourceAdapter.id}: ${error instanceof Error ? error.message : error}`,
    );
  }

  // 4. Cache lookup by UPC (dedup: same album from different URL)
  if (sourceAlbum.upc) {
    const cachedByUpc = await tryAlbumCache({ upc: sourceAlbum.upc });
    if (cachedByUpc) return fillMissingAlbumServices(cachedByUpc);
  }

  // 5. Resolve on all other services in parallel
  const links = await resolveAlbumAcrossServices(sourceAlbum, sourceAdapter);

  // 6. If source album has no artwork, use artwork from a cross-service result
  // (e.g., Tidal API v2 doesn't return imageLinks for albums)
  if (!sourceAlbum.artworkUrl) {
    const artworkLink =
      links.find((l) => l.service === "spotify" && l.artworkUrl) ??
      links.find((l) => l.service === "apple-music" && l.artworkUrl) ??
      links.find((l) => l.artworkUrl);
    if (artworkLink?.artworkUrl) {
      sourceAlbum = { ...sourceAlbum, artworkUrl: artworkLink.artworkUrl };
    }
  }

  // 7. Add source service link
  links.unshift({
    service: sourceAdapter.id,
    displayName: sourceAdapter.displayName,
    url: sourceAlbum.webUrl,
    confidence: 1.0,
    matchMethod: "upc",
    externalId: sourceAlbum.sourceId,
  });

  return { sourceAlbum, links };
}

/**
 * Task 2.7: Text search for albums.
 * Tries Spotify first (best album search API), then other adapters.
 */
export async function resolveAlbumTextSearch(query: string): Promise<AlbumResolutionResult> {
  const active = await getActiveAdapters();
  const searchAdapters = active.filter(
    (a) => Boolean(a.albumCapabilities?.supportsAlbumSearch) && Boolean(a.searchAlbum),
  );

  // Prioritize Spotify (most reliable album search)
  const spotifyFirst = [
    ...searchAdapters.filter((a) => a.id === "spotify"),
    ...searchAdapters.filter((a) => a.id !== "spotify"),
  ];

  for (const adapter of spotifyFirst) {
    try {
      const result = await adapter.searchAlbum?.({
        title: query,
        artist: query,
      });

      if (result?.found && result.album) {
        // Cache lookup by UPC before full cross-service resolve
        if (result.album.upc) {
          const cached = await tryAlbumCache({ upc: result.album.upc });
          if (cached) return fillMissingAlbumServices(cached);
        }

        let sourceAlbum = result.album;
        const links = await resolveAlbumAcrossServices(sourceAlbum, adapter);

        if (!sourceAlbum.artworkUrl) {
          const artworkLink =
            links.find((l) => l.service === "spotify" && l.artworkUrl) ??
            links.find((l) => l.service === "apple-music" && l.artworkUrl) ??
            links.find((l) => l.artworkUrl);
          if (artworkLink?.artworkUrl) {
            sourceAlbum = { ...sourceAlbum, artworkUrl: artworkLink.artworkUrl };
          }
        }

        links.unshift({
          service: adapter.id,
          displayName: adapter.displayName,
          url: sourceAlbum.webUrl,
          confidence: result.confidence,
          matchMethod: "search",
          externalId: sourceAlbum.sourceId,
        });

        return { sourceAlbum, links };
      }
    } catch {}
  }

  throw new ResolveError("TRACK_NOT_FOUND", "No album found for the search query");
}
