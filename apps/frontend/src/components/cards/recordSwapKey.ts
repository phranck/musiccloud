import { albumIdentityKey } from "@/lib/resolve/album-identity";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";

/** The config fields the record-swap key is derived from: album identity plus the track-level fallback fields. */
export type RecordSwapKeyInput = Pick<
  MediaCardContentConfiguration,
  "artist" | "album" | "labelAlbumTitle" | "artworkUrl" | "shortId" | "previewUrl" | "title"
>;

/**
 * Identity key for the vinyl record shown on the deck, used by `RecordSwapStage`
 * to decide when to run the arc swap. It is **album-scoped**: two tracks of the
 * same album share the key, so switching between them does NOT swap the record
 * (the deck keeps spinning and only the audio source changes, per the same-album
 * behavior). A different album yields a different key, so the record swaps.
 *
 * Entities without an album (singles, artist pages) have no stable album key, so
 * they fall back to a track-unique key (short id, preview URL, title, artist) and
 * therefore swap per track.
 *
 * This used to double as the audio hub's remount `key`. The hub no longer remounts
 * on a track change (so the outgoing record survives long enough to animate out);
 * this value now only drives the swap decision, while the audio engine reacts to
 * the `previewUrl` prop change in place.
 *
 * @param content - The resolved media configuration (or the subset in {@link RecordSwapKeyInput}).
 * @returns A stable string key for the current record's identity.
 */
export function recordSwapKey(content: RecordSwapKeyInput): string {
  const albumKey = albumIdentityKey(content);
  if (albumKey !== null) return `album::${albumKey}`;
  return `track::${content.shortId ?? ""}::${content.previewUrl ?? ""}::${content.title}::${content.artist}`;
}
