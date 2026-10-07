import type { ArtistTopTrack } from "@musiccloud/shared";
import type { ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { AudioStatus } from "@/components/audio/AudioStatus";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";

/** The two player states in which a track counts as the one the share page holds. */
export type NowPlayingStatus = typeof AudioStatus.Playing | typeof AudioStatus.Paused;

/**
 * The track the share page's player holds, described so an artist track list
 * can find its row. Built by {@link buildNowPlayingTrack} and matched by
 * {@link findNowPlayingRowIndex}, so the identity rule lives in this module
 * alone.
 *
 * @property status - Whether the player runs or holds its position. Rows show
 *   the same mark for both; the indicator's bars only move while playing.
 * @property trackUrls - Exact identities a row's `deezerUrl` slot can equal: the
 *   candidate the track was resolved from by a row click, then every platform
 *   link of its share. A commercial share carries the Deezer link its row was
 *   built from even when it was created from another service.
 * @property shortId - The share's short id, equal to a row's `shortId` when the
 *   backend found a share for that row's track.
 * @property title - The track title, compared only when no exact identity matches.
 * @property artist - The artist line (`artists.join(", ")`), compared with the title.
 */
export interface NowPlayingTrack {
  status: NowPlayingStatus;
  trackUrls: readonly string[];
  shortId?: string;
  title: string;
  artist: string;
}

/**
 * Describes the track the share page's player holds, or `null` while the
 * player neither plays nor pauses.
 *
 * @param config - The media-card configuration currently shown.
 * @param resolvedCandidate - The row candidate (`deezerUrl` slot) the shown
 *   track was resolved from in place, or `null` when the page opened on it.
 * @param status - The player's current status.
 * @returns The {@link NowPlayingTrack}, or `null` when no row should be marked.
 */
export function buildNowPlayingTrack(
  config: MediaCardContentConfiguration,
  resolvedCandidate: string | null,
  status: AudioStatus | null,
): NowPlayingTrack | null {
  if (status !== AudioStatus.Playing && status !== AudioStatus.Paused) return null;
  const platformUrls = config.platforms.map((link) => link.url);
  return {
    status,
    trackUrls: resolvedCandidate ? [resolvedCandidate, ...platformUrls] : platformUrls,
    shortId: config.shortId,
    title: config.title,
    artist: config.artist,
  };
}

/**
 * Finds the one row of an artist track list that shows the track the player
 * holds.
 *
 * An exact identity wins anywhere in the list. Only when none matches does the
 * title and artist line decide, which is what finds the row on a Creative
 * Commons page opened directly: its row candidate is an opaque token and its
 * rows carry no short id. Requiring the artist line keeps a similar artist's
 * track of the same name unmarked.
 *
 * @param items - The list's rows, in display order.
 * @param nowPlaying - The held track, or `null` while nothing plays.
 * @returns The row's index, or `-1` when no row shows the held track.
 */
export function findNowPlayingRowIndex(items: readonly ArtistTrackItem[], nowPlaying: NowPlayingTrack | null): number {
  if (!nowPlaying) return -1;
  const exactIndex = items.findIndex(({ track }) => isSameTrack(track, nowPlaying));
  if (exactIndex !== -1) return exactIndex;
  const title = normalizeLabel(nowPlaying.title);
  const artist = normalizeLabel(nowPlaying.artist);
  return items.findIndex(
    ({ track }) => normalizeLabel(track.title) === title && normalizeLabel(track.artists.join(", ")) === artist,
  );
}

function isSameTrack(track: ArtistTopTrack, nowPlaying: NowPlayingTrack): boolean {
  if (nowPlaying.trackUrls.includes(track.deezerUrl)) return true;
  return track.shortId !== null && track.shortId === nowPlaying.shortId;
}

/** Ignores case and surrounding space, so the fallback does not hinge on how a service capitalizes a title. */
function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}
