/**
 * @file The Deezer preview refresh for a stored track or album.
 *
 * A signed Deezer preview expires within minutes, so a stored one is often
 * dead by the time it is served. Two paths fetch a fresh one: the resolve
 * persistence in `persist-resolution.ts` and the preview endpoint in
 * `routes/share-preview.ts`. Both call the refresh functions here, and the
 * share page, which never contacts Deezer, asks the two predicates whether the
 * endpoint can refresh at all. The predicates are the guards the refresh
 * functions check first, so the page never offers a refresh the endpoint
 * refuses. The rules about a URL's lifetime and choice live in
 * `lib/preview-url.ts`.
 */
import { Service } from "@musiccloud/shared";
import type { PreviewObservation, TrackRepository } from "../db/repository.js";
import { log } from "../lib/infra/logger.js";
import { isExpiredPreviewUrl, previewObservation } from "../lib/preview-url.js";
import { isTrackSearchFallbackMatch } from "./plugins/_shared/track-search-query.js";
import { deezerAdapter } from "./plugins/deezer/adapter.js";

/**
 * A stored destination of a track or album, read for the Deezer identity a
 * refresh needs independently of the canonical source's ISRC.
 *
 * @property service - The destination's service id.
 * @property url - The destination's stored URL.
 */
interface PreviewDestination {
  service: string;
  url: string;
}

/**
 * The stored track a preview is refreshed for.
 *
 * @property trackId - The stored track id the fresh preview row is written to.
 * @property isrc - The canonical ISRC, absent on many video-origin recordings.
 *   When present, Deezer is asked by ISRC.
 * @property title - The recording title, compared with Deezer's when the
 *   lookup goes through a Deezer link rather than the ISRC.
 * @property artists - The recording's artists, compared the same way.
 * @property durationMs - The recording's length, compared the same way when known.
 * @property links - The track's stored destinations, read for a Deezer track link.
 */
export interface RefreshableTrack {
  trackId: string;
  isrc: string | null | undefined;
  title: string;
  artists: readonly string[];
  durationMs: number | null | undefined;
  links: readonly PreviewDestination[];
}

/** The component every failed refresh is logged under. */
const LOG_COMPONENT = "PreviewRefresh";

/** The error code a failed or refused Deezer lookup is logged with. */
const PROVIDER_UNAVAILABLE_ERROR_CODE = "MC-API-0004";

/**
 * Reads the confirmed Deezer recording identity without following its URL.
 *
 * A video-origin track can have no canonical ISRC while already having a matched
 * Deezer destination. Only an actual Deezer track URL supplies this identity;
 * search pages, other hosts, credentials, and non-recording paths do not.
 *
 * @param links - Destinations already associated with the recording.
 * @returns The numeric Deezer recording id, or null when none is usable.
 */
export function deezerTrackIdFromLinks(links: readonly PreviewDestination[]): string | null {
  for (const link of links) {
    if (link.service !== Service.Deezer) continue;
    try {
      const url = new URL(link.url);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !["deezer.com", "www.deezer.com"].includes(url.hostname.replace(/\.$/, "")) ||
        url.username ||
        url.password
      )
        continue;
      const match = /^\/(?:[a-z]{2}\/)?track\/(\d{1,20})\/?$/.exec(url.pathname);
      if (match) return match[1];
    } catch {
      // A malformed stored destination cannot identify an outbound lookup.
    }
  }
  return null;
}

/**
 * The Deezer album id behind an album's stored Deezer link. A fresh album
 * preview is fetched by this id, so an album without one cannot be refreshed.
 *
 * @param links - The album's stored service links.
 * @returns The id from the first Deezer album link, or `null` when there is none.
 */
export function deezerAlbumIdFromLinks(links: readonly PreviewDestination[]): string | null {
  for (const link of links) {
    if (link.service !== Service.Deezer) continue;
    const deezerAlbumId = deezerAdapter.detectAlbumUrl(link.url);
    if (deezerAlbumId) return deezerAlbumId;
  }
  return null;
}

/**
 * Decides whether {@link refreshTrackPreview} can identify this recording.
 *
 * The share reader and the resolve response use it, so the player is not told
 * that a known Deezer recording has no refresh path merely because its original
 * source supplied no ISRC. This check makes no requests.
 *
 * @param isrc - Canonical ISRC, which may be absent on video-origin recordings.
 * @param links - Confirmed destinations belonging to the same recording.
 * @returns Whether identifier lookup or an actual Deezer track link permits refresh.
 */
export function isTrackPreviewRefreshable(
  isrc: string | null | undefined,
  links: readonly PreviewDestination[],
): boolean {
  return Boolean(isrc) || deezerTrackIdFromLinks(links) !== null;
}

/**
 * Decides whether {@link refreshAlbumPreview} can identify this album, which
 * needs a stored Deezer album link. This check makes no requests.
 *
 * @param links - The album's stored service links.
 * @returns Whether a Deezer album link permits refresh.
 */
export function isAlbumPreviewRefreshable(links: readonly PreviewDestination[]): boolean {
  return deezerAlbumIdFromLinks(links) !== null;
}

/**
 * Asks Deezer for a fresh preview of a stored track and stores it.
 *
 * The lookup goes by ISRC when the track has one, and otherwise through its
 * Deezer track link. A link lookup borrows audio only when Deezer's title,
 * artists and length match the stored recording, because a video-origin
 * source need not have supplied an ISRC. A preview Deezer returns already
 * expired is refused.
 *
 * @param repo - The repository the fresh preview row is written to.
 * @param track - The stored track, see {@link RefreshableTrack}.
 * @returns The fresh preview URL, or `null` when the track is not refreshable,
 *   Deezer has no preview, or the lookup fails. A failure is logged with
 *   `log.deviation`.
 */
export async function refreshTrackPreview(repo: TrackRepository, track: RefreshableTrack): Promise<string | null> {
  if (!isTrackPreviewRefreshable(track.isrc, track.links)) return null;
  const deezerTrackId = deezerTrackIdFromLinks(track.links);

  try {
    const deezerTrack = track.isrc
      ? await deezerAdapter.findByIsrc(track.isrc)
      : deezerTrackId
        ? await deezerAdapter.getTrack(deezerTrackId)
        : null;
    if (!deezerTrack?.previewUrl) return null;
    if (
      !track.isrc &&
      !isTrackSearchFallbackMatch(
        {
          title: track.title,
          artist: track.artists[0] ?? "",
          artists: [...track.artists],
          durationMs: track.durationMs ?? undefined,
        },
        deezerTrack,
      )
    ) {
      throw new Error("Deezer preview metadata does not match the stored recording");
    }
    await storeFreshPreview(deezerTrack.previewUrl, (observation) =>
      repo.upsertTrackPreview(track.trackId, observation),
    );
    return deezerTrack.previewUrl;
  } catch (error) {
    logRefreshFailure("track_preview_refresh", error);
    return null;
  }
}

/**
 * Asks Deezer for the top track's preview of a stored album, through its
 * Deezer album link, and stores it. A preview Deezer returns already expired
 * is refused.
 *
 * @param repo - The repository the fresh preview row is written to.
 * @param albumId - The stored album id.
 * @param links - The album's stored service links.
 * @returns The fresh preview URL, or `null` when the album has no Deezer link,
 *   Deezer has no preview, or the lookup fails. A failure is logged with
 *   `log.deviation`.
 */
export async function refreshAlbumPreview(
  repo: TrackRepository,
  albumId: string,
  links: readonly PreviewDestination[],
): Promise<string | null> {
  const deezerAlbumId = deezerAlbumIdFromLinks(links);
  if (!deezerAlbumId) return null;

  try {
    const deezerAlbum = await deezerAdapter.getAlbum(deezerAlbumId);
    if (!deezerAlbum.topTrackPreviewUrl) return null;
    await storeFreshPreview(deezerAlbum.topTrackPreviewUrl, (observation) =>
      repo.upsertAlbumPreview(albumId, observation),
    );
    return deezerAlbum.topTrackPreviewUrl;
  } catch (error) {
    logRefreshFailure("album_preview_refresh", error);
    return null;
  }
}

/**
 * Stores a preview URL Deezer just returned, refusing one that is already
 * expired so a dead URL is neither stored nor served.
 *
 * @param previewUrl - The preview URL from Deezer.
 * @param upsert - Writes the observation to the track or album preview table.
 * @throws When the URL is already expired, or when the write fails.
 */
async function storeFreshPreview(
  previewUrl: string,
  upsert: (observation: PreviewObservation) => Promise<void>,
): Promise<void> {
  if (isExpiredPreviewUrl(previewUrl)) throw new Error("Deezer returned an expired preview");
  await upsert(previewObservation(Service.Deezer, previewUrl));
}

/**
 * Logs a refresh that produced no preview because Deezer failed, refused the
 * match, or returned a dead URL.
 *
 * @param operation - `track_preview_refresh` or `album_preview_refresh`.
 * @param error - The error the lookup or the write threw.
 */
function logRefreshFailure(operation: "track_preview_refresh" | "album_preview_refresh", error: unknown): void {
  log.deviation(
    {
      component: LOG_COMPONENT,
      errorCode: PROVIDER_UNAVAILABLE_ERROR_CODE,
      operation,
      outcome: "preview_unavailable",
    },
    error,
  );
}
