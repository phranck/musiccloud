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
 * @returns The trimmed, lowercased value.
 */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The normalized album title of a config (LP paper-label title wins over the
 * plain `album` field, matching what the vinyl label prints), or `null` when the
 * entity carries no album at all (a single, or an artist entity).
 *
 * @param config - The album-identity input.
 * @returns The normalized album title, or `null` when no album is present.
 */
function albumTitle(config: AlbumIdentityInput): string | null {
  const raw = config.labelAlbumTitle ?? config.album;
  if (!raw) return null;
  const normalized = normalize(raw);
  return normalized.length > 0 ? normalized : null;
}

/**
 * The stable album-identity key of a config: a normalized `artist + album`
 * string, or `null` when the entity has no album (single/artist). Two tracks of
 * the same album share this key regardless of their differing track title,
 * preview URL or artwork, which is exactly what the turntable hub keys on to
 * avoid remounting the deck on a same-album track switch.
 *
 * There is no stable `albumId` in the domain, so this derived key is the single
 * source of truth for album sameness. {@link sameAlbum} is defined in terms of
 * it, so the swap decision and the hub remount decision can never diverge.
 *
 * @param config - The album-identity input.
 * @returns The album-identity key, or `null` when the entity has no album.
 */
export function albumIdentityKey(config: AlbumIdentityInput): string | null {
  const title = albumTitle(config);
  return title === null ? null : `${normalize(config.artist)}::${title}`;
}

/**
 * Decides whether two configs belong to the same album, which is the signal the
 * turntable uses to keep the record on the deck (no vinyl swap) and only switch
 * the audio track.
 *
 * Two configs are the same album exactly when they share a non-null
 * {@link albumIdentityKey} (same artist and same album title). A missing album
 * on either side means the entity is standalone and never matches, so selecting
 * a single always counts as a real change.
 *
 * @param a - The currently displayed config.
 * @param b - The newly resolved config.
 * @returns `true` when both configs are the same album, otherwise `false`.
 */
export function sameAlbum(a: AlbumIdentityInput, b: AlbumIdentityInput): boolean {
  const keyA = albumIdentityKey(a);
  return keyA !== null && keyA === albumIdentityKey(b);
}
