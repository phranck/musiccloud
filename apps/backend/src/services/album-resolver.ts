/**
 * @file Album resolve pipeline: URL -> cross-service link set.
 *
 * Parallel in structure to `artist-resolver.ts` and the track half of
 * `resolver.ts`, but with album-specific identifiers and matching
 * strategies. Entry points are `resolveAlbumUrl` (URL input) and
 * `resolveAlbumTextSearch` (free-text input).
 *
 * ## Three matching strategies, in order
 *
 * Per target service, `resolveAlbumOnService` tries three strategies
 * and stops at the first hit. The order is deliberately from strongest
 * to weakest evidence:
 *
 * | Strategy          | Evidence                     | Confidence  |
 * | ----------------- | ---------------------------- | ----------- |
 * | UPC lookup        | Shared Universal Product Code| 1.0         |
 * | ISRC inference    | Sampled track ISRCs agree    | 0.7 to 0.9  |
 * | Text search       | Title + artist fuzzy match   | scored      |
 *
 * UPC is the album-level analogue of ISRC: a strict, globally unique
 * ID assigned by the music industry, so a UPC match is as strong as an
 * identifier match gets.
 *
 * ## ISRC inference (`inferAlbumViaIsrc`)
 *
 * Many services expose `findByIsrc` for tracks but not an album-level
 * ID lookup. We piggyback on the track API: sample up to
 * `ISRC_SAMPLE_SIZE` (5) tracks from the source album, call
 * `findByIsrc` on each against the target service, collect the album
 * names those tracks belong to, and pick the most common. If at least
 * `ISRC_INFERENCE_MIN_MATCH_FRACTION` (1/3) of sampled tracks agree on
 * the same album name, we accept it.
 *
 * Confidence is scored in the 0.7 to 0.9 range: stronger than pure
 * text search (ISRCs verify the tracks exist on the target) but
 * weaker than a direct UPC match (album identity is inferred, not
 * asserted). The sampling step spreads across the tracklist evenly so
 * a single disc-one block does not dominate the vote.
 *
 * Once the name is inferred, we follow up with a real album search
 * (`resolveAlbumViaSearch`) to get a proper album URL, artwork, and
 * `topTrackPreviewUrl`. If that follow-up fails, we fall back to the
 * first sampled track's URL - a working link on the target, even if
 * it points at a track rather than the album.
 *
 * ## `topTrackPreviewUrl` threading
 *
 * Album payloads carry a preview URL for the share page's inline
 * player. Deezer's `/search/album` endpoint does not return tracks,
 * so `resolveAlbumViaSearch` follows up with `getAlbum(sourceId)`
 * when the search result lacks a preview but the adapter can serve
 * full album detail. Without this, Deezer-matched albums would ship
 * a silent preview player.
 *
 * ## YouTube Music derivation
 *
 * YouTube exposes albums as playlists with an `OLAK5uy_` prefix in
 * the `list=` query param. The YT and YT Music URLs map mechanically:
 * swap `www.youtube.com/...?list=OLAK5uy_...` to
 * `music.youtube.com/playlist?list=OLAK5uy_...`. If YouTube matched
 * via its playlist endpoint, we synthesise the YouTube Music link
 * from the same playlist ID instead of running a separate search.
 *
 * ## Artwork fallback
 *
 * Tidal's API v2 does not return artwork for albums. When the source
 * album lacks an `artworkUrl`, we borrow one from the cross-service
 * results in preference order Spotify -> Apple Music -> any. The
 * preference mirrors image-quality: Spotify and Apple Music both
 * serve high-resolution artwork consistently.
 */
import { PLATFORM_CONFIG } from "@musiccloud/shared";
import { getRepository } from "../db/index.js";
import { CACHE_TTL_MS } from "../lib/config.js";
import { log } from "../lib/infra/logger.js";
import { stripTrackingParams } from "../lib/platform/url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import { collectAlbumExternalIds } from "./external-ids.js";
import { filterDisabledLinks, getActiveAdapters, identifyServiceIncludingDisabled, isPluginEnabled } from "./index.js";
import type {
  AlbumMatchResult,
  AlbumSearchQuery,
  ExternalIdRecord,
  NormalizedAlbum,
  ServiceAdapter,
  ServiceId,
} from "./types.js";
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
  /**
   * Record label from the resolved album. Drives the `label` backfill
   * when the source adapter does not return one (e.g. Spotify after the
   * Feb-2026 removal of `album.label`).
   */
  label?: string;
  /**
   * UPC reported by this service for the album. May differ from the
   * source album's UPC for regional re-issues. Drives the
   * `album_external_ids` aggregation.
   */
  upc?: string;
}

export interface AlbumResolutionResult {
  sourceAlbum: NormalizedAlbum;
  links: ResolvedAlbumLink[];
  albumId?: string; // present when loaded from cache
  /**
   * External-id observations harvested across every adapter contacted
   * during the album resolve. Persisted into `album_external_ids`.
   * Always present; empty array when no IDs were collected.
   */
  externalIds: ExternalIdRecord[];
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

    return { sourceAlbum: cached.album, links, albumId: cached.albumId, externalIds: [] };
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

  if (missingAdapters.length === 0) return { ...cached, links: await filterDisabledLinks(cached.links) };

  log.debug("AlbumResolver", `Gap-filling ${missingAdapters.length} new services for cached album`);

  const results = await Promise.allSettled(missingAdapters.map((a) => resolveAlbumOnService(a, cached.sourceAlbum)));

  const newLinks: ResolvedAlbumLink[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      newLinks.push(result.value);
    }
  }

  if (newLinks.length === 0) return { ...cached, links: await filterDisabledLinks(cached.links) };

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

  if (!sourceAlbum.label) {
    const label = pickLabelFromLinks(allLinks);
    if (label) sourceAlbum = { ...sourceAlbum, label };
  }

  return {
    sourceAlbum,
    links: await filterDisabledLinks(allLinks),
    albumId: cached.albumId,
    externalIds: collectAlbumExternalIds(sourceAlbum, newLinks),
  };
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
  // synthesising a broken /album/{trackId} URL. The user lands on the track
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
          label: album.label,
          upc: album.upc,
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
      // ignore, use search result as-is
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
    label: album.label,
    upc: album.upc,
  };
}

/**
 * Pick a record label from cross-service links. Deezer first (free,
 * keyless, broad coverage), Apple Music second (recordLabel from
 * /v1/catalog/.../albums), then any other adapter that surfaced one.
 *
 * Returns undefined when no adapter provided a label.
 */
function pickLabelFromLinks(links: ResolvedAlbumLink[]): string | undefined {
  return (
    links.find((l) => l.service === "deezer" && l.label)?.label ??
    links.find((l) => l.service === "apple-music" && l.label)?.label ??
    links.find((l) => l.label)?.label
  );
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

/**
 * Main URL entry point. Strips tracking params, cache-hits by URL or
 * UPC, otherwise walks the full pipeline: identify source, fetch
 * metadata, resolve across other services, enrich, persist.
 *
 * @param inputUrl - streaming-service URL identifying an album
 * @returns resolved album result with source plus cross-service links
 * @throws `ResolveError("SERVICE_DISABLED")` if the URL belongs to a currently-disabled plugin
 * @throws `ResolveError("NOT_MUSIC_LINK")` if no adapter recognizes the URL shape
 * @throws `ResolveError("INVALID_URL")` if the adapter cannot extract an album ID
 * @throws `ResolveError("SERVICE_DOWN")` (or the adapter's own MC code) if metadata fetch fails
 */
export async function resolveAlbumUrl(inputUrl: string): Promise<AlbumResolutionResult> {
  const cleanUrl = stripTrackingParams(inputUrl);

  // 1. Cache lookup by URL
  const cached = await tryAlbumCache({ url: cleanUrl });
  if (cached) return fillMissingAlbumServices(cached);

  // 2. Identify which service the URL belongs to. Check disabled plugins
  //    first so a known-but-toggled-off source surfaces SERVICE_DISABLED
  //    instead of the generic NOT_MUSIC_LINK.
  const identified = await identifyServiceIncludingDisabled(cleanUrl);
  if (identified?.detectAlbumUrl?.(cleanUrl) && !(await isPluginEnabled(identified.id))) {
    throw new ResolveError("SERVICE_DISABLED", undefined, { service: identified.id });
  }
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

  // 6b. Same idea for label: Spotify removed `album.label` in Feb 2026,
  // and not every adapter returns one. Borrow from Deezer first
  // (keyless, broad), Apple Music second.
  if (!sourceAlbum.label) {
    const label = pickLabelFromLinks(links);
    if (label) sourceAlbum = { ...sourceAlbum, label };
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

  return {
    sourceAlbum,
    links,
    externalIds: collectAlbumExternalIds(sourceAlbum, links),
  };
}

/**
 * Text-search entry point. Iterates adapters in Spotify-first order
 * (Spotify's album search is the most reliable), returns on the first
 * match. Caches by UPC before running cross-service resolve.
 *
 * @param query - free-text album title (also used as artist in the
 *                search, since adapters accept both in one query field)
 * @returns resolved album result
 * @throws `ResolveError("TRACK_NOT_FOUND")` if no adapter finds a matching album
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

        if (!sourceAlbum.label) {
          const label = pickLabelFromLinks(links);
          if (label) sourceAlbum = { ...sourceAlbum, label };
        }

        links.unshift({
          service: adapter.id,
          displayName: adapter.displayName,
          url: sourceAlbum.webUrl,
          confidence: result.confidence,
          matchMethod: "search",
          externalId: sourceAlbum.sourceId,
        });

        return {
          sourceAlbum,
          links,
          externalIds: collectAlbumExternalIds(sourceAlbum, links),
        };
      }
    } catch {}
  }

  throw new ResolveError("TRACK_NOT_FOUND", "No album found for the search query");
}
