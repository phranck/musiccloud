/**
 * @file Deezer genre list loader and name→ID resolver.
 *
 * Deezer exposes a flat list of ~23 top-level genres at `GET /genre`. We
 * load that list once, cache it for 24 hours, and use it to translate the
 * user-typed genre name (e.g. "hip hop", "r&b", "JAZZ") into the numeric
 * genre ID that every other Deezer endpoint expects.
 *
 * ## Matching strategy
 *
 * The genre list is small and fairly stable, so a simple two-pass match
 * against a normalized form of each name works well:
 *
 *   1. **Exact** match on the normalized string.
 *   2. **Substring** match where the Deezer name *contains* the user's
 *      input — one-directional on purpose. Matching both directions would
 *      let "krautrock" accidentally resolve to "Rock" because
 *      `"krautrock".includes("rock")` is true.
 *
 * Normalization lowercases the string, collapses runs of whitespace, and
 * treats hyphens and slashes like spaces. That way "hip hop" and "hip-hop"
 * both match Deezer's "Rap/Hip Hop", and "r&b" matches "R&B" exactly.
 *
 * ## Promise coalescing
 *
 * If the first two requests after startup fire in parallel, both would
 * otherwise trigger independent `GET /genre` calls. `inflight` ensures
 * only one HTTP request is outstanding at a time — mirrors the token
 * refresh pattern required by the project's concurrency rules.
 *
 * ## `UnknownGenreError`
 *
 * Carries the full supported-genres list so the caller (the route handler)
 * can return a 400 with an actionable message instead of a generic "not
 * found".
 */
import { fetchWithTimeout } from "../../lib/infra/fetch.js";
import { log } from "../../lib/infra/logger.js";

const DEEZER_GENRE_URL = "https://api.deezer.com/genre";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface ResolvedGenre {
  /** Deezer's numeric genre ID, usable with `/genre/{id}/...` endpoints. */
  id: number;
  /** Original Deezer display name (original casing). */
  name: string;
}

export class UnknownGenreError extends Error {
  public readonly input: string;
  public readonly supportedGenres: string[];

  constructor(input: string, supportedGenres: string[]) {
    super(`Unknown genre: '${input}'. Supported: ${supportedGenres.join(", ")}`);
    this.name = "UnknownGenreError";
    this.input = input;
    this.supportedGenres = supportedGenres;
  }
}

interface DeezerGenre {
  id: number;
  name: string;
}

interface DeezerGenreResponse {
  data?: DeezerGenre[];
}

let cache: { genres: DeezerGenre[]; expiresAt: number } | null = null;
let inflight: Promise<DeezerGenre[]> | null = null;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[-/]+/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchGenres(): Promise<DeezerGenre[]> {
  const res = await fetchWithTimeout(DEEZER_GENRE_URL, {}, 5000);
  if (!res.ok) {
    throw new Error(`Deezer /genre returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as DeezerGenreResponse;
  // Deezer has a pseudo-genre with id=0 called "All" — skip it.
  const genres = (body.data ?? []).filter((g) => g.id !== 0);
  cache = { genres, expiresAt: Date.now() + TTL_MS };
  log.debug("GenreMap", `Loaded ${genres.length} Deezer genres`);
  return genres;
}

async function loadGenres(): Promise<DeezerGenre[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.genres;
  }
  if (inflight) {
    return inflight;
  }
  inflight = fetchGenres().finally(() => {
    inflight = null;
  });
  return inflight;
}

/**
 * Resolve a user-supplied genre name to Deezer's canonical entry.
 * @throws {UnknownGenreError} when no entry matches.
 */
export async function resolveGenreName(input: string): Promise<ResolvedGenre> {
  const genres = await loadGenres();
  const needle = normalize(input);

  if (needle === "") {
    throw new UnknownGenreError(
      input,
      genres.map((g) => g.name),
    );
  }

  // Pass 1: exact match on normalized form.
  for (const g of genres) {
    if (normalize(g.name) === needle) {
      return { id: g.id, name: g.name };
    }
  }

  // Pass 2: substring match — only "Deezer name contains the user's input"
  // to avoid false positives like "krautrock" → "Rock".
  for (const g of genres) {
    if (normalize(g.name).includes(needle)) {
      return { id: g.id, name: g.name };
    }
  }

  throw new UnknownGenreError(
    input,
    genres.map((g) => g.name),
  );
}

/** Returns the cached supported-genres list (loads on first call). */
export async function listSupportedGenres(): Promise<string[]> {
  const genres = await loadGenres();
  return genres.map((g) => g.name);
}

/** Reset the module cache. Exposed only for tests. */
export function _resetGenreCacheForTests(): void {
  cache = null;
  inflight = null;
}
