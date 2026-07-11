/**
 * Shared types for the normalized Discogs vinyl layout.
 *
 * `VinylLayout` is the structure the backend derives from a Discogs release
 * and persists in `album_vinyl_layouts`. The frontend (MC-117) reads it
 * and renders per-track groove rings on the turntable.
 *
 * Both apps import from `@musiccloud/shared` so the contract is DRY and
 * stays in sync across the full stack.
 */

/**
 * A single track as reported by Discogs, with its duration converted to
 * milliseconds for easy arithmetic in both the backend normalizer and the
 * frontend groove-length calculation.
 */
export interface VinylLayoutTrack {
  /**
   * The Discogs track position string, e.g. `"A1"`, `"B2"`, or just `"A"`
   * for a single-track side. Preserved verbatim from the Discogs tracklist so
   * the frontend can display it as-is.
   */
  position: string;

  /**
   * Track title as reported by Discogs. No normalization is applied; the
   * value is copied verbatim from the Discogs tracklist.
   */
  title: string;

  /**
   * Track duration in milliseconds. Parsed from the Discogs `"M:SS"` (or
   * `"MM:SS"`) duration string. Only tracks with a parseable, non-zero
   * duration are included; a release whose tracklist has any unparseable
   * duration is discarded entirely (normalized to `null`).
   */
  durationMs: number;
}

/**
 * One physical side of a vinyl record (side A, B, C, D, ...), containing
 * all tracks pressed on that side in play order (outer groove to inner groove).
 */
export interface VinylSide {
  /**
   * The physical side letter: `"A"`, `"B"`, `"C"`, `"D"`, etc.
   * Derived from the leading alphabetic prefix of the Discogs position string
   * (e.g. `"B2"` -> `"B"`). Single-letter positions (e.g. `"A"`) are used
   * as-is.
   */
  label: string;

  /**
   * The side's tracks in play order (outer groove to inner groove), matching
   * the order they appear in the Discogs tracklist.
   */
  tracks: VinylLayoutTrack[];
}

/**
 * Normalized vinyl layout derived from a single Discogs release.
 * Persisted in `album_vinyl_layouts.layout_data` (jsonb) and
 * included verbatim in the resolve API response under `vinylLayout`.
 *
 * A `null` value in the database means "checked, no suitable vinyl pressing
 * found" (negative cache). This type represents the positive case only.
 */
export interface VinylLayout {
  /**
   * The Discogs release ID the layout was derived from. Stored for
   * provenance and to enable cache-busting if the source data changes.
   * Corresponds to `album_external_ids.discogs_release`.
   */
  discogsReleaseId: string;

  /**
   * The record's sides, ordered A, B, C, ... Each side lists its tracks in
   * play order (outer to inner groove).
   */
  sides: VinylSide[];
}
