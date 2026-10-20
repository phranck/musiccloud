import { isAppleArtworkUrl, isYouTubeArtworkUrl } from "../../services/artwork.js";

/** The tables that store a cover or a portrait, with the column that holds it and the key that names the row. */
export const ARTWORK_COLUMNS = {
  tracks: { column: "artwork_url", keyColumn: "id" },
  albums: { column: "artwork_url", keyColumn: "id" },
  artist_profiles: { column: "image_url", keyColumn: "artist_entity_id" },
} as const;

/** A table that stores artwork. */
export type StoredArtworkTable = keyof typeof ARTWORK_COLUMNS;

/** Why the current cover policy does not allow a stored value. */
export type RejectedArtworkPolicy = "apple_artwork" | "youtube_recording_artwork";

/**
 * Applies the cover policy of `services/artwork.ts` to a stored value.
 *
 * Apple allows its artwork only together with its own playback, so no table may keep one. A YouTube image is a video
 * frame and never a recording's cover, but a YouTube channel portrait is a legitimate artist image, so an artist
 * profile may keep one. The evidence capture and the artwork repair both use this function, so they cannot disagree.
 *
 * @param table - The table the value is stored in.
 * @param url - The stored value.
 * @returns The policy that rejects it, or `null` when the value is allowed.
 */
export function rejectedStoredArtwork(table: StoredArtworkTable, url: string): RejectedArtworkPolicy | null {
  if (isAppleArtworkUrl(url)) return "apple_artwork";
  if (table !== "artist_profiles" && isYouTubeArtworkUrl(url)) return "youtube_recording_artwork";
  return null;
}
