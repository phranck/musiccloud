/**
 * @file Album matching across services: the three per-service strategies (UPC
 * lookup, ISRC inference, text search), the YouTube Music derivation, the label
 * pick and the parallel lookup on every other service.
 *
 * The strategy order and the confidence each one reports are described in the
 * header of `album-resolver.ts`.
 */
import { getPlatformLabel } from "@musiccloud/shared";
import { log } from "../../lib/infra/logger.js";
import { parseReleaseYear } from "../../lib/release-date.js";
import type { ResolvedAlbumLink } from "../album-resolver.js";
import { confidenceForMethod } from "../confidence.js";
import { IDENTIFIER_MATCH_CONFIDENCE, LINK_QUALITY_THRESHOLD } from "../constants.js";
import { getActiveAdapters } from "../index.js";
import { collectSettledLinks } from "../resolved-links.js";
import type { AlbumMatchResult, AlbumSearchQuery, NormalizedAlbum, ServiceAdapter } from "../types.js";

/**
 * Share of the sampled tracks that must agree on one album name before
 * {@link inferAlbumViaIsrc} accepts it. `0.33`, so at least one in three.
 */
const ISRC_INFERENCE_MIN_MATCH_FRACTION = 0.33;

/** How many tracks {@link inferAlbumViaIsrc} samples from the source album. `5`. */
const ISRC_SAMPLE_SIZE = 5;

/**
 * Confidence of an ISRC-inferred album when the agreeing share is zero. The
 * inferred confidence starts here and grows with the share. `0.7`, above a
 * typical text match because the ISRCs prove the tracks exist on the target.
 */
const ISRC_INFERENCE_CONFIDENCE_BASE = 0.7;

/**
 * How much confidence a full agreement of the sampled tracks adds on top of
 * {@link ISRC_INFERENCE_CONFIDENCE_BASE}. `0.2`, so the inferred confidence
 * stays within `0.7` to `0.9`, below a UPC match at `IDENTIFIER_MATCH_CONFIDENCE`.
 */
const ISRC_INFERENCE_CONFIDENCE_SPAN = 0.2;

/**
 * Derives a YouTube Music album link from a YouTube album playlist link.
 *
 * YouTube exposes albums as playlists whose `list=` id starts with `OLAK5uy_`,
 * and YouTube Music serves the same id under `music.youtube.com/playlist`.
 *
 * @param links - The links resolved so far.
 * @returns The derived YouTube Music link with the YouTube link's confidence and
 *   match method, or `null` when there is no YouTube album playlist link or a
 *   YouTube Music link is already present.
 */
export function deriveYouTubeMusicAlbumLink(links: ResolvedAlbumLink[]): ResolvedAlbumLink | null {
  const youtubeLink = links.find((link) => link.service === "youtube");
  if (!youtubeLink || links.some((link) => link.service === "youtube-music")) return null;
  const playlistMatch = /[?&]list=(OLAK5uy_[^&]+)/.exec(youtubeLink.url);
  if (!playlistMatch) return null;
  return {
    service: "youtube-music",
    displayName: getPlatformLabel("youtube-music"),
    url: `https://music.youtube.com/playlist?list=${playlistMatch[1]}`,
    confidence: youtubeLink.confidence,
    matchMethod: youtubeLink.matchMethod,
    externalId: youtubeLink.externalId ?? playlistMatch[1],
  };
}

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
 *
 * @param adapter - The target service.
 * @param sourceAlbum - The album the resolve started from, with its track list.
 * @returns The album link with `matchMethod: "isrc-inference"` and a confidence
 *   of {@link ISRC_INFERENCE_CONFIDENCE_BASE} plus the agreeing share times
 *   {@link ISRC_INFERENCE_CONFIDENCE_SPAN}, a track link when the follow-up
 *   album search fails, or `null` when too few sampled tracks agree.
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

  const confidence = ISRC_INFERENCE_CONFIDENCE_BASE + matchFraction * ISRC_INFERENCE_CONFIDENCE_SPAN;

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
  // cache (canonical album row never expires post-migration 0021) and
  // skip every external API call here.
  try {
    const link = await resolveAlbumViaSearch(adapter, { ...sourceAlbum, title: best.albumName });
    if (link) {
      return { ...link, confidence, matchMethod: "isrc-inference" };
    }
  } catch (err) {
    log.deviation(
      {
        adapterId: adapter.id,
        component: "AlbumResolver",
        errorCode: "MC-API-0004",
        operation: "album_isrc_followup_search",
        outcome: "track_url_fallback",
      },
      err,
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

/**
 * Try to find an album on a single target service.
 *
 * Strategy order:
 * 1. UPC lookup (most reliable, confidence 1.0)
 * 2. ISRC-based inference (track ISRCs → derive album, confidence 0.7 to 0.9)
 * 3. Text search (title + artist, confidence varies)
 *
 * @param adapter - The target service.
 * @param sourceAlbum - The album the resolve started from.
 * @returns The link from the first strategy that finds the album, or `null`
 *   when none does. A failing UPC lookup or ISRC inference falls through to
 *   the next strategy; a failing text search rejects.
 */
export async function resolveAlbumOnService(
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
          confidence: IDENTIFIER_MATCH_CONFIDENCE,
          matchMethod: "upc",
          externalId: album.sourceId,
          topTrackPreviewUrl: album.topTrackPreviewUrl,
          artworkUrl: album.artworkUrl,
          label: album.label,
          upc: album.upc,
          mbid: album.mbid,
        };
      }
    } catch (error) {
      log.deviation(
        {
          adapterId: adapter.id,
          component: "AlbumResolver",
          errorCode: "MC-API-0004",
          operation: "album_upc_lookup",
          outcome: "next_strategy",
        },
        error,
      );
    }
  }

  // Strategy 2: ISRC-based inference (if source has track listing with ISRCs)
  if (sourceAlbum.tracks && sourceAlbum.tracks.length > 0) {
    try {
      const inferred = await inferAlbumViaIsrc(adapter, sourceAlbum);
      if (inferred) return inferred;
    } catch (error) {
      log.deviation(
        {
          adapterId: adapter.id,
          component: "AlbumResolver",
          errorCode: "MC-API-0004",
          operation: "album_isrc_inference",
          outcome: "text_search_fallback",
        },
        error,
      );
    }
  }

  // Strategy 3: Text search
  return resolveAlbumViaSearch(adapter, sourceAlbum);
}

/**
 * Finds an album on a target service by title, first artist, release year and
 * track count, then fetches the full album when the search result carries no
 * preview and the adapter can supply one.
 *
 * @param adapter - The target service.
 * @param sourceAlbum - The album to search for.
 * @returns The matched link with the adapter's own match method and its
 *   confidence capped by `confidenceForMethod`, or `null` when the adapter has
 *   no album search or finds nothing. A failing search rejects.
 */
async function resolveAlbumViaSearch(
  adapter: ServiceAdapter,
  sourceAlbum: NormalizedAlbum,
): Promise<ResolvedAlbumLink | null> {
  if (!adapter.albumCapabilities?.supportsAlbumSearch || !adapter.searchAlbum) return null;

  const query: AlbumSearchQuery = {
    title: sourceAlbum.title,
    artist: sourceAlbum.artists[0] ?? "",
    year: parseReleaseYear(sourceAlbum.releaseDate)?.toString(),
    totalTracks: sourceAlbum.totalTracks,
  };

  const result: AlbumMatchResult = await adapter.searchAlbum(query);

  if (!result.found || !result.album) return null;

  // Search endpoints (e.g. Deezer /search/album) don't return tracks, so topTrackPreviewUrl
  // is missing. Fetch full album details only when the adapter can supply a preview.
  let album = result.album;
  if (!album.topTrackPreviewUrl && adapter.capabilities.supportsPreview && adapter.getAlbum && album.sourceId) {
    try {
      const full = await adapter.getAlbum(album.sourceId);
      if (full.topTrackPreviewUrl) album = full;
    } catch (error) {
      log.deviation(
        {
          adapterId: adapter.id,
          component: "AlbumResolver",
          errorCode: "MC-API-0004",
          operation: "album_detail_enrichment",
          outcome: "search_result_fallback",
        },
        error,
      );
    }
  }

  return {
    service: adapter.id,
    displayName: adapter.displayName,
    url: album.webUrl,
    confidence: confidenceForMethod(result.matchMethod as ResolvedAlbumLink["matchMethod"], result.confidence),
    matchMethod: result.matchMethod as ResolvedAlbumLink["matchMethod"],
    externalId: album.sourceId,
    topTrackPreviewUrl: album.topTrackPreviewUrl,
    artworkUrl: album.artworkUrl,
    label: album.label,
    upc: album.upc,
    mbid: album.mbid,
  };
}

/**
 * Pick a record label from cross-service links. Deezer first (free,
 * keyless, broad coverage), Apple Music second (recordLabel from
 * /v1/catalog/.../albums), then any other adapter that surfaced one.
 *
 * @param links - The resolved album links.
 * @returns The picked label, or `undefined` when no adapter provided one.
 */
export function pickLabelFromLinks(links: ResolvedAlbumLink[]): string | undefined {
  return (
    links.find((l) => l.service === "deezer" && l.label)?.label ??
    links.find((l) => l.service === "apple-music" && l.label)?.label ??
    links.find((l) => l.label)?.label
  );
}

/**
 * Looks the source album up on every other active service with album support
 * and waits for all of them.
 *
 * @param sourceAlbum - The album the resolve started from.
 * @param excludeAdapter - The source service, which is not asked again.
 * @returns The matched links plus a derived YouTube Music link, sorted by
 *   confidence and filtered by {@link LINK_QUALITY_THRESHOLD}.
 */
export async function resolveAlbumAcrossServices(
  sourceAlbum: NormalizedAlbum,
  excludeAdapter: ServiceAdapter,
): Promise<ResolvedAlbumLink[]> {
  const active = await getActiveAdapters();
  const targetAdapters = active.filter((a) => a.id !== excludeAdapter.id && Boolean(a.albumCapabilities));

  const results = await Promise.allSettled(
    targetAdapters.map((adapter) => resolveAlbumOnService(adapter, sourceAlbum)),
  );

  const links = collectSettledLinks(targetAdapters, results, { component: "AlbumResolver", logRejected: true });

  const derived = deriveYouTubeMusicAlbumLink(links);
  if (derived) links.push(derived);

  // Sort by confidence (highest first)
  links.sort((a, b) => b.confidence - a.confidence);

  // Filter out low-confidence matches
  return links.filter((l) => l.confidence >= LINK_QUALITY_THRESHOLD);
}
