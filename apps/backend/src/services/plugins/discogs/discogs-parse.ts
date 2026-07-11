/**
 * Pure parsing helpers for Discogs API data.
 *
 * These functions have no side effects, perform no I/O, and carry no
 * state. They are the foundational building blocks used by higher-level
 * normalisation and enrichment code in the same directory.
 */

import type { VinylLayout, VinylSide } from "@musiccloud/shared";

/**
 * A single entry from the Discogs Master Versions endpoint
 * (`GET /masters/{id}/versions`).
 *
 * Only the fields required for original-pressing selection are included.
 * The Discogs client (Task 5) reuses this interface when mapping the raw
 * API response into a typed list before calling `selectOriginalVinylVersion`.
 *
 * @property id - Discogs release ID of this pressing.
 * @property released - Release year string as returned by the API, e.g. `"1959"`.
 *   May carry extra characters; only the leading four digits are used for
 *   year comparison.
 * @property format - Comma-joined format descriptor returned by the API,
 *   e.g. `"LP, Album, Stereo"` or `"LP, Album, Reissue, Mono"`.
 * @property country - Two-letter country code of the pressing, when present.
 */
export interface DiscogsMasterVersion {
  id: number;
  released: string;
  format: string;
  country?: string;
}

/**
 * Parses a Discogs track-duration string into milliseconds.
 *
 * Discogs encodes durations as `"M:SS"` or `"MM:SS"` (minutes colon
 * zero-padded seconds). The function accepts both forms and returns the
 * total duration in milliseconds so it can be stored and compared with
 * the rest of the musiccloud track model.
 *
 * @param value - The raw duration string from the Discogs `tracklist[].duration` field.
 * @returns Total duration in milliseconds, or `null` when the value is
 *   empty, zero-length, has out-of-range seconds, or does not match the
 *   expected `M:SS` / `MM:SS` format.
 */
export function parseDiscogsDuration(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const minutes = Number.parseInt(match[1], 10);
  const seconds = Number.parseInt(match[2], 10);
  const durationMs = (minutes * 60 + seconds) * 1000;
  return seconds < 60 && durationMs > 0 ? durationMs : null;
}

/**
 * Derives the physical vinyl side letter from a Discogs track position.
 *
 * Discogs encodes positions as a leading alphabetic prefix followed by an
 * optional numeric suffix, for example `"A"`, `"B2"`, `"C1"`. The side
 * letter is the leading `[A-Za-z]+` prefix. Purely numeric positions (e.g.
 * `"3"`) indicate a CD or non-sided format and yield `null`.
 *
 * The returned label is always upper-cased to ensure consistent grouping
 * regardless of how the source data was capitalised.
 *
 * @param position - The raw position string from the Discogs `tracklist[].position` field.
 * @returns The uppercase side letter (e.g. `"A"`, `"B"`, `"C"`), or `null`
 *   when the position is empty or starts with a digit rather than a letter.
 */
export function sideLabelFromPosition(position: string): string | null {
  const match = /^([A-Za-z]+)/.exec(position);
  if (!match) {
    return null;
  }
  return match[1].toUpperCase();
}

/**
 * Selects the original vinyl pressing from a list of Discogs master versions.
 *
 * "Original" is defined as the non-reissue vinyl version with the earliest
 * release year. When two versions share the same earliest year, the one that
 * appears first in the input array is returned (stable, input-order tie-break).
 *
 * Filtering rules applied in order:
 * 1. Keep only versions whose `format` contains `"Vinyl"` or `"LP"`
 *    (case-insensitive). All other formats (CD, Cassette, …) are discarded.
 * 2. Drop versions whose `format` contains `"Reissue"` (case-insensitive).
 * 3. Among the remaining candidates, pick the one with the smallest year
 *    derived from the leading four digits of the `released` field.
 *
 * @param versions - Array of version entries from the Discogs Master Versions
 *   endpoint (`GET /masters/{id}/versions`).
 * @returns The best-matching `DiscogsMasterVersion`, or `null` when no version
 *   survives the filters (empty input, only reissues, only non-vinyl formats).
 */
export function selectOriginalVinylVersion(versions: DiscogsMasterVersion[]): DiscogsMasterVersion | null {
  const VINYL_RE = /\b(vinyl|lp)\b/i;
  const REISSUE_RE = /\breissue\b/i;

  const candidates = versions.filter((v) => VINYL_RE.test(v.format) && !REISSUE_RE.test(v.format));

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((best, current) => {
    const bestYear = Number.parseInt(best.released.slice(0, 4), 10);
    const currentYear = Number.parseInt(current.released.slice(0, 4), 10);
    return currentYear < bestYear ? current : best;
  });
}

// =============================================================================
// DiscogsTrack / DiscogsRelease — raw shapes from the Discogs Release endpoint
// =============================================================================

/**
 * A single entry from the Discogs release tracklist
 * (`GET /releases/{id}` → `tracklist[]`).
 *
 * Both the backend normaliser and the Discogs HTTP client (Task 5) share this
 * interface, so it is exported from this module.
 *
 * @property position - Discogs track position, e.g. `"A"`, `"B1"`, `"C2"`.
 *   Purely numeric positions (e.g. `"3"`) indicate a non-vinyl format.
 * @property type_ - Entry type as returned by the API. Only `"track"` entries
 *   are included in the layout; all others (`"heading"`, `"index"`, …) are
 *   ignored during normalisation.
 * @property title - Track title, verbatim from the API.
 * @property duration - Duration string in `"M:SS"` or `"MM:SS"` format.
 *   May be an empty string when Discogs has no duration data for the track.
 */
export interface DiscogsTrack {
  position: string;
  type_: string;
  title: string;
  duration: string;
}

/**
 * Minimal shape of the Discogs Release object used for vinyl layout
 * normalisation (`GET /releases/{id}`).
 *
 * Only the fields required by `normalizeReleaseToLayout` are declared. The
 * Discogs HTTP client (Task 5) maps the full API response to this interface
 * before passing it to the normaliser.
 *
 * @property id - Discogs release ID.
 * @property tracklist - All tracklist entries for the release, in play order.
 *   May contain headings, index tracks, and other non-track entries that
 *   `normalizeReleaseToLayout` silently ignores.
 */
export interface DiscogsRelease {
  id: number;
  tracklist: DiscogsTrack[];
}

// =============================================================================
// normalizeReleaseToLayout
// =============================================================================

/**
 * Converts a Discogs release object into a normalised `VinylLayout`.
 *
 * This is a pure function: no I/O, no side effects, fully deterministic.
 * It is called after the release has already been confirmed to be a vinyl
 * pressing (via `selectOriginalVinylVersion`), so format validation is
 * intentionally omitted here.
 *
 * **Filtering:** Only tracklist entries with `type_ === "track"` are
 * considered. Headings, index entries, and any other types are silently
 * discarded before grouping.
 *
 * **Completeness requirement:** If any considered track has an unparseable
 * or empty `duration` (i.e. `parseDiscogsDuration` returns `null`), or if
 * any track has a `position` that does not yield a side label (i.e.
 * `sideLabelFromPosition` returns `null`), the entire release is discarded
 * and `null` is returned. Incomplete data cannot produce a meaningful groove
 * visualisation.
 *
 * **Grouping and ordering:** Tracks are grouped into `VinylSide` buckets by
 * side label. Side order follows the first appearance of each label in the
 * input tracklist (A, B, C, …). Track order within each side is preserved
 * from the input.
 *
 * @param release - The Discogs release object to normalise.
 * @returns A `VinylLayout` when the release has complete, parseable track
 *   data, or `null` when any required field is missing or unparseable.
 */
export function normalizeReleaseToLayout(release: DiscogsRelease): VinylLayout | null {
  const tracks = release.tracklist.filter((t) => t.type_ === "track");
  if (tracks.length === 0) return null;

  // Resolve all durations and side labels up front; bail on any null.
  const resolved: Array<{ position: string; title: string; durationMs: number; sideLabel: string }> = [];
  for (const track of tracks) {
    const durationMs = parseDiscogsDuration(track.duration);
    if (durationMs === null) {
      return null;
    }
    const sideLabel = sideLabelFromPosition(track.position);
    if (sideLabel === null) {
      return null;
    }
    resolved.push({ position: track.position, title: track.title, durationMs, sideLabel });
  }

  // Group into sides, preserving input order for both sides and tracks.
  const sideMap = new Map<string, VinylSide>();
  const sideOrder: string[] = [];
  for (const t of resolved) {
    let side = sideMap.get(t.sideLabel);
    if (!side) {
      side = { label: t.sideLabel, tracks: [] };
      sideMap.set(t.sideLabel, side);
      sideOrder.push(t.sideLabel);
    }
    side.tracks.push({ position: t.position, title: t.title, durationMs: t.durationMs });
  }

  return {
    discogsReleaseId: String(release.id),
    sides: sideOrder.map((label) => sideMap.get(label) as VinylSide),
  };
}
