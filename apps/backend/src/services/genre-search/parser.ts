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
}

export class GenreQueryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenreQueryParseError";
  }
}

const VALID_KEYS = ["genre", "tracks", "albums", "artists", "vibe"] as const;
type ValidKey = (typeof VALID_KEYS)[number];

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

  const segments = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const raw: Partial<{
    genres: string[];
    tracks: number;
    albums: number;
    artists: number;
    vibe: ValidVibe;
  }> = {};
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
        const genres = rawValue
          .split("|")
          .map((g) => g.trim())
          .filter((g) => g.length > 0);
        if (genres.length === 0) {
          throw new GenreQueryParseError("Missing value for 'genre'");
        }
        raw.genres = genres;
        break;
      }
      case "tracks":
      case "albums":
      case "artists": {
        raw[key] = parsePositiveInteger(rawValue, rawKey);
        break;
      }
      case "vibe": {
        const vibe = rawValue.toLowerCase();
        if (!isValidVibe(vibe)) {
          throw new GenreQueryParseError(`'vibe' must be one of: ${VALID_VIBES.join(", ")} (got '${rawValue}')`);
        }
        raw.vibe = vibe;
        break;
      }
    }
  }

  if (!raw.genres) {
    throw new GenreQueryParseError("Missing required field 'genre'");
  }

  const anyTypeSpecified = raw.tracks !== undefined || raw.albums !== undefined || raw.artists !== undefined;

  return {
    genres: raw.genres,
    tracks: anyTypeSpecified ? (raw.tracks ?? null) : DEFAULT_COUNT,
    albums: anyTypeSpecified ? (raw.albums ?? null) : DEFAULT_COUNT,
    artists: anyTypeSpecified ? (raw.artists ?? null) : DEFAULT_COUNT,
    vibe: raw.vibe ?? "hot",
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
