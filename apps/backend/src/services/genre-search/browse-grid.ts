/**
 * @file The genre browse grid (`genre:?`): popular Last.fm tags as tiles, the
 * caches behind it and the cover URLs the grid build discovers.
 */

import type { ApiGenreTile } from "@musiccloud/shared";
import { mapWithConcurrency } from "../../lib/concurrency.js";
import { log } from "../../lib/infra/logger.js";
import { genreArtworkTileUrl, genreDisplayName, isValidGenreKey } from "../genre-artwork/genre-key.js";
import { getStoredArtworkSummaries, type StoredArtworkSummary } from "../genre-artwork/index.js";
import { isGenreTag, lastFmGet } from "../plugins/lastfm/lastfm-response.js";
import { cacheAlbumImageInBackground, findGenreAlbumCover, logLastfmDeviation } from "./lastfm-api.js";

// In-memory cache for the genre browse grid.
let browseCache: { tiles: ApiGenreTile[]; expiresAt: number } | null = null;
let browseCacheInflight: Promise<ApiGenreTile[]> | null = null;
const BROWSE_TTL_MS = 24 * 60 * 60 * 1000;

/** A grid that lost tiles to failed probes is rebuilt after this long. */
const DEGRADED_BROWSE_TTL_MS = 5 * 60 * 1000;

/**
 * Last.fm cover probes in flight at once while the grid is built. Firing all
 * of them together invites throttling, and every failed probe drops a tile.
 */
const BROWSE_PROBE_CONCURRENCY = 8;

/** How many top tags the grid is chosen from before filtering. */
const BROWSE_TOP_TAG_LIMIT = 400;

/** The number of tiles the grid keeps. */
const BROWSE_GENRE_COUNT = 250;

/** A tag from `chart.getTopTags`, or a forced decade without a reach. */
interface BrowseTag {
  name: string;
  reach?: string;
}

// Cover URL that the browse-grid builder discovered for each genre key.
// The artwork route consults this map first so a cold-cache artwork burst
// does NOT duplicate the `tag.getTopAlbums` call that the grid build just
// made. In production those duplicate parallel Last.fm calls hit rate
// limits and timeouts, and the generator fell through to its blue fallback.
const genreCoverUrls = new Map<string, string>();

/**
 * Looks up the cover URL captured during the most recent browse-grid build.
 *
 * @param genreKey - The canonical genre key.
 * @returns The cover URL, or `null` when the build found none for that genre.
 */
export function getCachedGenreCoverUrl(genreKey: string): string | null {
  return genreCoverUrls.get(genreKey) ?? null;
}

/**
 * Drop the in-memory browse-grid cache so the next `getGenreBrowseGrid()`
 * call re-fetches from Last.fm and re-runs the album-cover probes.
 */
export function resetBrowseCache(): void {
  browseCache = null;
  genreCoverUrls.clear();
}

// Decades we always want in the browse grid. Last.fm's top-tags list
// reliably surfaces recent ones (60s-2010s) but older decades rarely
// make the cut, so we inject them as fallback candidates. Dedupe picks
// the real Last.fm tag whenever one exists.
const FORCED_DECADE_TAGS: BrowseTag[] = [
  { name: "30s" },
  { name: "40s" },
  { name: "50s" },
  { name: "60s" },
  { name: "70s" },
  { name: "80s" },
  { name: "90s" },
];

/**
 * Hard-coded aliases for genre shortforms whose letters sit directly
 * next to each other. Regex normalisation can't tell them apart from a
 * real word (e.g. `rnb` vs `sundance`), so we treat them as an explicit
 * lookup table. Keys are already in the regex-normalised form (lowercase,
 * "&" → "and", spaces collapsed).
 */
const GENRE_ALIASES: Record<string, string> = {
  rnb: "r and b",
  "r'n'b": "r and b",
  dnb: "drum and bass",
  "d'n'b": "drum and bass",
};

/**
 * Fold "&", "n", "'n'" and surrounding whitespace variants into a single
 * canonical "and" so different spellings of the same genre (e.g.
 * "Rock and Roll" / "rock n roll" / "drum 'n' bass") collapse onto one
 * key. Used both for dedupe and as the tile's stable id / cache key.
 * Tight shortforms like `rnb` or `dnb` are resolved through `GENRE_ALIASES`
 * because a letter-level regex would be too eager (would catch `sundance`).
 *
 * @param name - The tag name as Last.fm spells it.
 * @returns The canonical genre key.
 */
function canonicalizeGenreKey(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+'?n'?\s+/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
  return GENRE_ALIASES[normalized] ?? normalized;
}

/**
 * Fetches the top tags, drops non-genre tags, adds the decades Last.fm tends
 * to leave out, and collapses spellings of one genre onto the variant with
 * the highest reach.
 *
 * @returns Candidate tags in Last.fm's popularity order.
 */
async function fetchBrowseCandidates(): Promise<BrowseTag[]> {
  const data = await lastFmGet<{ tags?: { tag?: BrowseTag[] } }>("chart.getTopTags", {
    limit: String(BROWSE_TOP_TAG_LIMIT),
  });
  // Decades stay, because the grid shows them on purpose.
  const rawCandidates = (data?.tags?.tag ?? []).filter((t) => isGenreTag(t.name, { keepDates: true }));

  for (const forced of FORCED_DECADE_TAGS) {
    if (!rawCandidates.some((t) => t.name.toLowerCase() === forced.name)) {
      rawCandidates.push(forced);
    }
  }

  const bestByKey = new Map<string, { tag: BrowseTag; reach: number }>();
  for (const tag of rawCandidates) {
    const key = canonicalizeGenreKey(tag.name);
    const reach = Number(tag.reach ?? 0);
    const existing = bestByKey.get(key);
    if (!existing || reach > existing.reach) bestByKey.set(key, { tag, reach });
  }
  return [...bestByKey.values()].map((v) => v.tag);
}

/**
 * Reads the stored artworks of the candidate genres. A failed read only
 * costs speed, because every genre is then probed on Last.fm.
 *
 * @param keys - Canonical genre keys.
 * @returns The stored artwork per genre, or an empty map when the read failed.
 */
async function readStoredArtworks(keys: string[]): Promise<Map<string, StoredArtworkSummary>> {
  try {
    return await getStoredArtworkSummaries(keys);
  } catch (error) {
    log.deviation(
      {
        component: "LastfmGenreSearch",
        errorCode: "MC-DB-0004",
        operation: "browse_stored_artwork_lookup",
        outcome: "probe_every_genre",
      },
      error,
    );
    return new Map();
  }
}

/**
 * Picks the genres whose cover has to be asked for on Last.fm. The grid takes
 * the first {@link BROWSE_GENRE_COUNT} genres with a cover in popularity
 * order, so once the genres with a stored cover alone fill it, no genre
 * further down can get in, and asking about it would only cost time.
 *
 * @param keys - Canonical genre keys in popularity order.
 * @param stored - Stored artworks per genre key.
 * @returns Indices into `keys` of the genres to probe.
 */
function selectGenresToProbe(keys: string[], stored: Map<string, StoredArtworkSummary>): number[] {
  const toProbe: number[] = [];
  let confirmed = 0;
  for (let index = 0; index < keys.length && confirmed < BROWSE_GENRE_COUNT; index++) {
    if (stored.get(keys[index])?.hasSourceCover) confirmed++;
    else toProbe.push(index);
  }
  return toProbe;
}

/** Outcome of asking Last.fm whether a genre has an album with a cover. */
interface CoverProbe {
  hasCover: boolean;
  /** True when the request failed, so the answer is unknown rather than no. */
  failed: boolean;
}

/**
 * Asks Last.fm for the genre's top albums and records the first cover found,
 * both for the artwork route ({@link getCachedGenreCoverUrl}) and in the
 * permanent `album_images` cache.
 *
 * @param tagName - The tag as Last.fm spells it.
 * @param genreKey - The canonical key the tile is stored under.
 * @returns Whether a cover exists, and whether the request failed.
 */
async function probeGenreCover(tagName: string, genreKey: string): Promise<CoverProbe> {
  try {
    const cover = await findGenreAlbumCover(tagName);
    if (!cover) return { hasCover: false, failed: false };
    genreCoverUrls.set(genreKey, cover.url);
    cacheAlbumImageInBackground(
      cover.album.artist.name,
      cover.album.name,
      cover.url,
      "browse_cover_cache_write",
      "tile_retained_without_cache_update",
    );
    return { hasCover: true, failed: false };
  } catch (error) {
    logLastfmDeviation("browse_cover_probe", "tile_dropped", error);
    return { hasCover: false, failed: true };
  }
}

/**
 * Fetch the genre browse grid: popular tags with procedurally generated
 * atmospheric artworks.
 *
 * The tag list is fetched from `chart.getTopTags` and filtered to genre tags
 * with `isGenreTag`, decades kept. A tile needs at least one album cover behind it, so a genre
 * without music never renders a default-accent tile. A genre whose stored
 * artwork was generated from a real cover already proves that; every other
 * genre is probed with `tag.getTopAlbums`, {@link BROWSE_PROBE_CONCURRENCY}
 * at a time. The tile image is not the album cover: each tile points at the
 * Astro frontend proxy `/api/genre-artwork/<name>`, which forwards to the
 * backend's v1 route and lazily renders a unique image derived from the
 * genre's top album color.
 *
 * Stored accents are inlined on the tile from the same batch query, so the
 * frontend can colorize the card before the artwork JPEG has finished
 * loading.
 *
 * The result is cached in memory for {@link BROWSE_TTL_MS}, or only for
 * {@link DEGRADED_BROWSE_TTL_MS} when a probe failed, so a burst of upstream
 * errors does not leave a thinner grid standing for a day. Probed cover URLs
 * keep flowing into the `album_images` table as a side effect.
 *
 * @returns The tiles, sorted by display name.
 */
export async function getGenreBrowseGrid(): Promise<ApiGenreTile[]> {
  if (browseCache && browseCache.expiresAt > Date.now()) return browseCache.tiles;
  if (browseCacheInflight) return browseCacheInflight;

  browseCacheInflight = (async () => {
    // A tag whose key the artwork route refuses, such as one with a slash or a
    // non-ASCII letter, would show a broken image, so it never becomes a tile.
    const candidates = (await fetchBrowseCandidates()).filter((tag) => isValidGenreKey(canonicalizeGenreKey(tag.name)));
    const keys = candidates.map((tag) => canonicalizeGenreKey(tag.name));
    const stored = await readStoredArtworks(keys);

    const probeIndices = selectGenresToProbe(keys, stored);
    const probes = new Map<number, CoverProbe>();
    await mapWithConcurrency(probeIndices, BROWSE_PROBE_CONCURRENCY, async (index) => {
      probes.set(index, await probeGenreCover(candidates[index].name, keys[index]));
    });

    const allTiles = keys.map((name, index) => {
      const summary = stored.get(name);
      const hasCover = summary?.hasSourceCover === true || probes.get(index)?.hasCover === true;
      const tile: ApiGenreTile = {
        name,
        // The same name the artwork bakes in, so label and image agree.
        displayName: genreDisplayName(name),
        // Points at the Astro frontend proxy, NOT the backend directly.
        // The browser resolves this relative URL against the page origin
        // (the Astro host), so the path must be the proxy path. The
        // proxy handler then forwards to `ENDPOINTS.v1.genreArtwork`.
        artworkUrl: genreArtworkTileUrl(name),
      };
      // The accent lets the frontend color the card before the JPEG loads.
      if (summary) tile.accentColor = summary.accentColor;
      return { tile, hasCover };
    });

    // Keep only tiles backed by real music, trim to target count, sort alphabetically
    const kept = allTiles
      .filter((t) => t.hasCover)
      .slice(0, BROWSE_GENRE_COUNT)
      .map((t) => t.tile)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" }));

    const failedProbes = [...probes.values()].filter((probe) => probe.failed).length;
    log.debug(
      "LastfmGenreSearch",
      `Browse grid: ${kept.length} genres with covers from ${allTiles.length} candidates (${probes.size} probed, ${failedProbes} failed)`,
    );
    const ttlMs = failedProbes > 0 ? DEGRADED_BROWSE_TTL_MS : BROWSE_TTL_MS;
    browseCache = { tiles: kept, expiresAt: Date.now() + ttlMs };
    return kept;
  })().finally(() => {
    browseCacheInflight = null;
  });

  return browseCacheInflight;
}
