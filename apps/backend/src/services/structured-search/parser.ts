/**
 * @file Parser for structured-search queries.
 *
 * Accepts strings of the form
 *
 *   title: Bohemian Rhapsody, artist: Queen
 *   title: Karma Police, artist: Radiohead, album: OK Computer, count: 5
 *   artist: Radiohead
 *
 * Mirrors the bauform of services/genre-search/parser.ts. Produces a
 * SearchQuery (services/types.ts:234) plus an optional candidateLimit
 * for the disambiguation cap. Resolver-mode only — discovery semantics
 * live in services/genre-search/.
 *
 * Genre-search-specific keys (genre, tracks, albums, artists, vibe) are
 * rejected here with a directive error message so users know to use the
 * genre: query shape instead.
 */

import type { SearchQuery } from "../types.js";

export interface ParsedStructuredQuery {
  /** SearchQuery shape ready for adapter calls. */
  search: SearchQuery;
  /** From `count:`, parser-validated 1..10. Resolver further clamps to MAX_CANDIDATES. */
  candidateLimit?: number;
  /** Non-fatal observations. Empty for clean queries. Future-proofing parity with genre-search. */
  warnings: string[];
}

export class StructuredSearchQueryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuredSearchQueryParseError";
  }
}

const VALID_KEYS = ["title", "artist", "album", "count"] as const;
type ValidKey = (typeof VALID_KEYS)[number];

const GENRE_ONLY_KEYS = ["genre", "tracks", "albums", "artists", "vibe"] as const;

const COUNT_MIN = 1;
const COUNT_MAX = 10;

const AUTO_COMMA_REGEX = new RegExp(`(?<!,)\\s+(${VALID_KEYS.join("|")})\\s*:`, "gi");
const STRUCTURED_PREFIX_REGEX = /^\s*(title|artist|album)\s*:/i;

function insertMissingCommas(input: string): string {
  return input.replace(AUTO_COMMA_REGEX, ", $1:");
}

function isValidKey(value: string): value is ValidKey {
  return (VALID_KEYS as readonly string[]).includes(value);
}

function isGenreOnlyKey(value: string): boolean {
  return (GENRE_ONLY_KEYS as readonly string[]).includes(value);
}

/** True iff the query starts with `title:`, `artist:`, or `album:`. */
export function isStructuredSearchQuery(input: string): boolean {
  return STRUCTURED_PREFIX_REGEX.test(input);
}

/**
 * Parse a structured-search query string.
 *
 * @throws {StructuredSearchQueryParseError} when the input is syntactically invalid.
 */
export function parseStructuredSearchQuery(input: string): ParsedStructuredQuery {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new StructuredSearchQueryParseError("Query is empty");
  }

  const segments = insertMissingCommas(trimmed)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let title: string | null = null;
  let artist: string | null = null;
  let album: string | null = null;
  let candidateLimit: number | null = null;
  const seenKeys = new Set<ValidKey>();

  for (const segment of segments) {
    const colonIdx = segment.indexOf(":");
    if (colonIdx === -1) {
      throw new StructuredSearchQueryParseError(`Expected 'key: value' in segment '${segment}'`);
    }

    const rawKey = segment.slice(0, colonIdx).trim();
    const rawValue = segment.slice(colonIdx + 1).trim();

    if (rawKey === "") {
      throw new StructuredSearchQueryParseError(`Missing key before ':' in segment '${segment}'`);
    }

    const key = rawKey.toLowerCase();

    if (isGenreOnlyKey(key)) {
      throw new StructuredSearchQueryParseError(
        `'${rawKey}' is only valid in genre: queries. Allowed here: title, artist, album, count`,
      );
    }

    if (!isValidKey(key)) {
      throw new StructuredSearchQueryParseError(
        `Unknown field '${rawKey}'. Allowed: title, artist, album, count`,
      );
    }

    if (seenKeys.has(key)) {
      throw new StructuredSearchQueryParseError(`Duplicate field '${rawKey}'`);
    }
    seenKeys.add(key);

    if (rawValue === "") {
      throw new StructuredSearchQueryParseError(`Missing value for '${rawKey}'`);
    }

    switch (key) {
      case "title":
        title = rawValue;
        break;
      case "artist":
        artist = rawValue;
        break;
      case "album":
        album = rawValue;
        break;
      case "count":
        candidateLimit = parseCount(rawValue);
        break;
    }
  }

  if (title === null && artist === null) {
    throw new StructuredSearchQueryParseError(
      "Structured query needs at least one of: title, artist",
    );
  }

  const search: SearchQuery = {
    title: title ?? "",
    artist: artist ?? "",
    ...(album !== null ? { album } : {}),
  };

  return {
    search,
    ...(candidateLimit !== null ? { candidateLimit } : {}),
    warnings: [],
  };
}

function parseCount(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new StructuredSearchQueryParseError(
      `'count' must be a positive integer (got '${raw}')`,
    );
  }
  const n = Number.parseInt(raw, 10);
  if (n < COUNT_MIN) {
    throw new StructuredSearchQueryParseError(`'count' must be at least ${COUNT_MIN} (got ${n})`);
  }
  if (n > COUNT_MAX) {
    throw new StructuredSearchQueryParseError(`'count' must be at most ${COUNT_MAX} (got ${n})`);
  }
  return n;
}
