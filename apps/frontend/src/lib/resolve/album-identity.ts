import type { MediaCardContentConfiguration } from "@/lib/types/media-card";

/**
 * The subset of a media configuration needed to decide album identity: the
 * artist plus the album title fields and the cover art. Kept as a `Pick` of the
 * real config so callers can pass a full {@link MediaCardContentConfiguration}
 * (or the resolved config from a track resolve) without adapting it.
 */
export type AlbumIdentityInput = Pick<
  MediaCardContentConfiguration,
  "artist" | "album" | "labelAlbumTitle" | "artworkUrl"
>;

/**
 * Trims and case-folds a free-text field so album/artist comparisons ignore
 * incidental casing and surrounding whitespace. Mirrors the artist
 * normalization used in `ShareLayout` so both sides agree on "same artist".
 *
 * @param value - The raw field value.
 * @returns The trimmed, locale-lowercased value.
 */
function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * The normalized album key of a config, or `null` when the entity carries no
 * album at all (a single, or an artist entity). A missing album key means the
 * entity is treated as standalone, never "the same album" as anything.
 *
 * The LP paper-label album title wins over the plain `album` field so the key
 * matches what the vinyl label actually prints.
 *
 * @param config - The album-identity input.
 * @returns The normalized album key, or `null` when no album is present.
 */
function albumKey(config: AlbumIdentityInput): string | null {
  const raw = config.labelAlbumTitle ?? config.album;
  if (!raw) return null;
  const normalized = normalize(raw);
  return normalized.length > 0 ? normalized : null;
}

/**
 * Decides whether two configs belong to the same album, which is the signal the
 * turntable uses to keep the record on the deck (no vinyl swap) and only switch
 * the audio track.
 *
 * There is no stable `albumId` in the domain, so identity is derived: both sides
 * must name the same artist and both must carry an album. Given that, they count
 * as the same album when either the album keys match or the cover artwork is
 * byte-identical. The artwork match is only an additional positive signal (it
 * catches differently-formatted album titles for the same release); it is never
 * the sole reason, because a missing album on either side already returns
 * `false`.
 *
 * @param a - The currently displayed config.
 * @param b - The newly resolved config.
 * @returns `true` when both configs are the same album, otherwise `false`.
 */
export function sameAlbum(a: AlbumIdentityInput, b: AlbumIdentityInput): boolean {
  if (normalize(a.artist) !== normalize(b.artist)) return false;

  const keyA = albumKey(a);
  const keyB = albumKey(b);
  if (keyA === null || keyB === null) return false;

  return keyA === keyB || a.artworkUrl === b.artworkUrl;
}
