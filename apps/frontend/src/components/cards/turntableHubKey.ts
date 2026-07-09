import { albumIdentityKey } from "@/lib/resolve/album-identity";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";

/**
 * The config fields the turntable hub key is derived from: the album-identity
 * fields plus the track-level fields used for the album-less fallback.
 */
export type TurntableHubKeyInput = Pick<
  MediaCardContentConfiguration,
  "artist" | "album" | "labelAlbumTitle" | "artworkUrl" | "shortId" | "previewUrl" | "title"
>;

/**
 * The React `key` for the `TurntablePlayerProvider` (audio hub) in
 * `MediaCardHead`. It is **album-scoped**: two tracks of the same album share
 * the key, so switching between them keeps the same hub instance mounted (the
 * deck keeps spinning and only the audio source is swapped, per the same-album
 * behavior). A different album yields a different key, so the hub remounts and
 * resets cleanly for the new record.
 *
 * Entities without an album (singles, artist pages) have no stable album key, so
 * they fall back to a track-unique key (short id, preview URL, title, artist) to
 * preserve the previous per-track remount behavior for those.
 *
 * @param content - The resolved media configuration (or the subset in {@link TurntableHubKeyInput}).
 * @returns A stable string key for the hub provider.
 */
export function turntableHubKey(content: TurntableHubKeyInput): string {
  const albumKey = albumIdentityKey(content);
  if (albumKey !== null) return `album::${albumKey}`;
  return `track::${content.shortId ?? ""}::${content.previewUrl ?? ""}::${content.title}::${content.artist}`;
}
