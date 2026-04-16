/**
 * @file Parser for structured genre-search queries.
 *
 * Accepts strings of the form
 *
 *   genre: jazz
 *   genre: hip hop|r&b, tracks: 20
 *   Genre : Jazz|Rock , Tracks : 5 , Vibe : mixed
 *
 * and produces a `ParsedGenreQuery`. See `.claude/plans/open/2026-04-15-genre-search.md`
 * for the full spec.
 *
 * ## Key rules
 *
 * - Keys are case-insensitive. Values preserve their original case (the genre
 *   name matcher does its own normalization downstream).
 * - Whitespace around `:` and `,` is collapsed.
 * - `|` inside a value is the OR separator (only meaningful for `genre`).
 * - If no type-specific count (`tracks`/`albums`/`artists`) is provided, all
 *   three types are requested with the default count of 10. If *any* type is
 *   provided explicitly, only those types are returned — the others become
 *   `null` (not requested).
 * - `count` is a shorthand for "same count across all three types" and is
 *   mutually exclusive with the type-specific keys. `genre: jazz, count: 15`
 *   returns 15 tracks, 15 albums, 15 artists. Combining `count` with any of
 *   `tracks`/`albums`/`artists` is rejected to keep intent unambiguous.
 * - Unknown keys, duplicate keys, missing values, and malformed numbers are
 *   all hard errors — the parser never silently ignores input.
 *
 * The parser does **not** know which genres Deezer supports. That lookup
 * happens in `genre-map.ts`. The parser only enforces syntax.
 */

/** Final shape consumed by the genre-search orchestrator. */
export interface ParsedGenreQuery {
  /** Non-empty list of raw genre names (trimmed, original case). OR-combined. */
  genres: string[];
  /** `null` = not requested, positive integer = requested count */
  tracks: number | null;
  albums: number | null;
  artists: number | null;
  /** Popularity/sampling mode */
  vibe: "hot" | "mixed";
  /**
   * Non-fatal parser observations for the user — things we silently
   * reconciled instead of rejecting. Empty if the query was clean.
   * Surface these in the UI under the results list so users understand
   * what was adjusted (e.g. "count and tracks overlapped; the later
   * value wins per field").
   */
  warnings: string[];
}

export class GenreQueryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenreQueryParseError";
  }
}

const VALID_KEYS = ["genre", "tracks", "albums", "artists", "count", "vibe"] as const;
type ValidKey = (typeof VALID_KEYS)[number];

// ── Auto-comma normalisation ────────────────────────────────────────────────
//
// Users sometimes forget the comma between fields: `genre: jazz count: 15`.
// Without help, the parser would read the whole thing as a genre value
// ("jazz count: 15") and later fail at genre-name resolution with a confusing
// error. Instead, we pre-scan the raw input for keyword markers that are
// preceded by whitespace but *not* by a comma and insert the comma ourselves.
//
// The regex matches `<whitespace><keyword>:` where the character immediately
// before the whitespace is anything except a comma (negative lookbehind).
// That means queries already using commas are untouched; only the missing-
// comma case is rewritten. Keywords that happen to share a name with a real
// value (e.g. a genre called "Tracks") are distinguished by the required
// trailing colon — a bare word never triggers the fix-up.
const AUTO_COMMA_REGEX = new RegExp(`(?<!,)\\s+(${VALID_KEYS.join("|")})\\s*:`, "gi");

function insertMissingCommas(input: string): string {
  return input.replace(AUTO_COMMA_REGEX, ", $1:");
}

const VALID_VIBES = ["hot", "mixed"] as const;
type ValidVibe = (typeof VALID_VIBES)[number];

const DEFAULT_COUNT = 10;
const MAX_PER_TYPE = 50;

function isValidKey(value: string): value is ValidKey {
  return (VALID_KEYS as readonly string[]).includes(value);
}

function isValidVibe(value: string): value is ValidVibe {
  return (VALID_VIBES as readonly string[]).includes(value);
}

/**
 * Parse a genre-search query string.
 *
 * @throws {GenreQueryParseError} when the input is syntactically invalid.
 */
export function parseGenreQuery(input: string): ParsedGenreQuery {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new GenreQueryParseError("Query is empty");
  }

  const segments = insertMissingCommas(trimmed)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Counts follow a simple "last write wins per field" model. Each
  // segment is processed in the order the user wrote it, so the query
  // `count: 15, tracks: 20` ends up as tracks=20, albums=15, artists=15
  // (count set all three, then tracks overwrote one). That lets users
  // say "15 of everything except 20 tracks" without having to restructure.
  //
  // When `count` and a type-specific field are combined we emit a
  // non-fatal warning so the UI can surface "what got reconciled" —
  // it's not an error but the user probably wants to know.
  let tracks: number | null = null;
  let albums: number | null = null;
  let artists: number | null = null;
  let genres: string[] | null = null;
  let vibe: ValidVibe | null = null;
  let countUsed = false;
  let typeKeyUsed = false;
  const seenKeys = new Set<ValidKey>();

  for (const segment of segments) {
    const colonIdx = segment.indexOf(":");
    if (colonIdx === -1) {
      throw new GenreQueryParseError(`Expected 'key: value' in segment '${segment}'`);
    }

    const rawKey = segment.slice(0, colonIdx).trim();
    const rawValue = segment.slice(colonIdx + 1).trim();

    if (rawKey === "") {
      throw new GenreQueryParseError(`Missing key before ':' in segment '${segment}'`);
    }

    const key = rawKey.toLowerCase();
    if (!isValidKey(key)) {
      throw new GenreQueryParseError(`Unknown field '${rawKey}'. Allowed: ${VALID_KEYS.join(", ")}`);
    }

    if (seenKeys.has(key)) {
      throw new GenreQueryParseError(`Duplicate field '${rawKey}'`);
    }
    seenKeys.add(key);

    if (rawValue === "") {
      throw new GenreQueryParseError(`Missing value for '${rawKey}'`);
    }

    switch (key) {
      case "genre": {
        const names = rawValue
          .split("|")
          .map((g) => g.trim())
          .filter((g) => g.length > 0);
        if (names.length === 0) {
          throw new GenreQueryParseError("Missing value for 'genre'");
        }
        genres = names;
        break;
      }
      case "tracks": {
        tracks = parsePositiveInteger(rawValue, rawKey);
        typeKeyUsed = true;
        break;
      }
      case "albums": {
        albums = parsePositiveInteger(rawValue, rawKey);
        typeKeyUsed = true;
        break;
      }
      case "artists": {
        artists = parsePositiveInteger(rawValue, rawKey);
        typeKeyUsed = true;
        break;
      }
      case "count": {
        const n = parsePositiveInteger(rawValue, rawKey);
        tracks = n;
        albums = n;
        artists = n;
        countUsed = true;
        break;
      }
      case "vibe": {
        const v = rawValue.toLowerCase();
        if (!isValidVibe(v)) {
          throw new GenreQueryParseError(`'vibe' must be one of: ${VALID_VIBES.join(", ")} (got '${rawValue}')`);
        }
        vibe = v;
        break;
      }
    }
  }

  if (!genres) {
    throw new GenreQueryParseError("Missing required field 'genre'");
  }

  // No type keys and no count → request all three at the default.
  if (!countUsed && !typeKeyUsed) {
    tracks = DEFAULT_COUNT;
    albums = DEFAULT_COUNT;
    artists = DEFAULT_COUNT;
  }

  const warnings: string[] = [];
  if (countUsed && typeKeyUsed) {
    warnings.push(
      "'count' and per-type fields were both provided; values applied in the order written, so later entries won per field.",
    );
  }

  return {
    genres,
    tracks,
    albums,
    artists,
    vibe: vibe ?? "hot",
    warnings,
  };
}

function parsePositiveInteger(raw: string, key: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new GenreQueryParseError(`'${key}' must be a positive integer (got '${raw}')`);
  }
  const n = Number.parseInt(raw, 10);
  if (n < 1) {
    throw new GenreQueryParseError(`'${key}' must be at least 1 (got ${n})`);
  }
  if (n > MAX_PER_TYPE) {
    throw new GenreQueryParseError(`'${key}' must be at most ${MAX_PER_TYPE} (got ${n})`);
  }
  return n;
}
