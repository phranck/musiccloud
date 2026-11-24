/**
 * @file Completes a fresh track resolve: link visibility, one destination per
 * provider, the derived YouTube Music link, the kept cover and the initial
 * identifier collection.
 */
import { getPlatformLabel } from "@musiccloud/shared";
import { log } from "../../lib/infra/logger.js";
import { youtubeVideoId } from "../../lib/platform/youtube-video.js";
import { pickPreferredPreview } from "../../lib/preview-url.js";
import { pickRecordingArtworkUrl, RECORDING_ARTWORK_LOOKUP_SERVICES } from "../artwork.js";
import { collectTrackExternalIds } from "../external-ids.js";
import { filterDisabledLinks, getActiveAdapters } from "../index.js";
import type { NormalizedTrack, ServiceId } from "../types.js";
import type { ResolutionResult, ResolvedLink } from "./types.js";

/**
 * Builds the result of a resolve that went to the services rather than the
 * database, once the source link is in `links`. Every such path ends here, so
 * each one keeps a cover by the same rule.
 *
 * @param sourceTrack - The track the resolve started from.
 * @param links - Every link found, the source's included.
 * @param lateLinks - Links still on their way, see {@link ResolutionResult.lateLinks}.
 * @returns The result, its track carrying the cover {@link withKeptArtwork} keeps.
 */
export async function completeFreshResolution(
  sourceTrack: NormalizedTrack,
  links: ResolvedLink[],
  lateLinks: Promise<ResolvedLink[]> | undefined,
): Promise<ResolutionResult> {
  const visible = await filterDisabledLinks(links);
  normalizeTrackLinks(visible);
  const track = await withKeptArtwork(
    {
      ...sourceTrack,
      previewUrl: pickPreferredPreview(visible, sourceTrack.previewUrl),
    },
    visible,
  );
  return {
    sourceTrack: track,
    links: visible,
    externalIds: collectTrackExternalIds(track, visible),
    lateLinks,
  };
}

/**
 * Gives fresh metadata a permitted cover through {@link pickRecordingArtworkUrl}.
 *
 * @param sourceTrack - The resolved track, with the cover its service returned.
 * @param links - The links the resolve found, each with the cover its service
 *   returned.
 * @returns The track with the kept cover, or with none. When neither the track
 *   nor a link has a cover to keep and the track has an ISRC, the cover comes
 *   from {@link findArtworkByIsrc}.
 */
async function withKeptArtwork(sourceTrack: NormalizedTrack, links: readonly ResolvedLink[]): Promise<NormalizedTrack> {
  let artworkUrl = pickRecordingArtworkUrl(sourceTrack.artworkUrl, links, sourceTrack.sourceService);
  if (!artworkUrl && sourceTrack.isrc) {
    artworkUrl = await findArtworkByIsrc(sourceTrack.isrc, new Set(links.map((link) => link.service)));
  }
  return { ...sourceTrack, artworkUrl };
}

/**
 * Asks {@link RECORDING_ARTWORK_LOOKUP_SERVICES} in turn for a cover of the recording.
 *
 * @param isrc - The track's ISRC.
 * @param considered - Services whose link is already in the result. They are
 *   skipped, because their cover was part of the pick that came up empty.
 * @returns The first cover that may be kept, or `undefined`. A service that
 *   fails is logged as a deviation and the next one is asked.
 */
async function findArtworkByIsrc(isrc: string, considered: ReadonlySet<string>): Promise<string | undefined> {
  const active = await getActiveAdapters();
  for (const serviceId of RECORDING_ARTWORK_LOOKUP_SERVICES) {
    const adapter = active.find((candidate) => candidate.id === serviceId);
    if (!adapter || considered.has(serviceId)) continue;
    try {
      const track = await adapter.findByIsrc(isrc);
      const artworkUrl = pickRecordingArtworkUrl(track?.artworkUrl);
      if (artworkUrl) return artworkUrl;
    } catch (error) {
      log.deviation(
        {
          adapterId: serviceId,
          component: "Resolver",
          errorCode: "MC-API-0004",
          operation: "track_artwork_enrichment",
          outcome: "next_artwork_source",
        },
        error,
      );
    }
  }
  return undefined;
}

/**
 * Keeps one destination per provider and derives a validated music-video alias.
 *
 * Sources are assembled first. A recording replaces a search-page fallback,
 * while stronger evidence can replace a weaker provider observation. Validated
 * video grammar is shared with the input adapter; search pages never become
 * recording destinations. Availability filtering belongs to the calling boundary.
 *
 * @param links - Final source set or completed deadline batch, mutated in place.
 */
export function normalizeTrackLinks(links: ResolvedLink[]): void {
  const unique = new Map<ServiceId, ResolvedLink>();
  for (const link of links) {
    const current = unique.get(link.service);
    if (
      !current ||
      (current.matchMethod === "search-fallback" && link.matchMethod !== "search-fallback") ||
      (link.matchMethod !== "search-fallback" && link.confidence > current.confidence)
    )
      unique.set(link.service, link);
  }
  links.splice(0, links.length, ...unique.values());
  const youtubeLink = links.find((link) => link.service === "youtube");
  if (
    !youtubeLink ||
    youtubeLink.matchMethod === "search-fallback" ||
    links.some((link) => link.service === "youtube-music")
  )
    return;

  const videoId = youtubeVideoId(youtubeLink.url);
  if (!videoId) return;
  links.push({
    service: "youtube-music",
    displayName: getPlatformLabel("youtube-music"),
    url: `https://music.youtube.com/watch?v=${videoId}`,
    confidence: youtubeLink.confidence,
    matchMethod: youtubeLink.matchMethod,
    externalId: videoId,
  });
}
