/**
 * @file Last.fm-backed genre-search implementation.
 *
 * Uses Last.fm's tag system for genre discovery. Last.fm has thousands of
 * community-curated tags (trance, bebop, shoegaze, krautrock, ...) far
 * beyond the ~22 top-level genres that Spotify/Apple/Deezer expose.
 *
 * ## Endpoints
 *
 *   tag.getTopTracks  — top tracks for a tag, ranked by listener count
 *   tag.getTopAlbums  — top albums for a tag (includes artwork)
 *   tag.getTopArtists — top artists for a tag
 *
 * ## Artwork strategy
 *
 *   - Albums: Last.fm includes real cover art directly in the response.
 *   - Tracks: Last.fm returns a placeholder. We do a parallel batch of
 *     `track.getInfo` calls to get the album cover for each track.
 *   - Artists: Resolved via the shared Spotify-backed `getArtistImages()`.
 *
 * All artwork URLs are permanently cached in Postgres (track_images,
 * album_images, artist_images) so repeat queries have zero extra HTTP cost.
 *
 * ## Sampling
 *
 * Last.fm tags are already ranked by popularity. We fetch a larger pool
 * (up to 50) and apply the same sampling strategies as the Deezer/Apple
 * adapters: top-N for `hot`, stratified sample for `mixed`.
 *
 * ## No credential required
 *
 * Only the LASTFM_API_KEY env var, which the project already has for
 * artist-info enrichment.
 */

import { fetchWithTimeout } from "../../lib/infra/fetch.js";
import { log } from "../../lib/infra/logger.js";
import { extractPrimaryArtist } from "../artist-utils.js";
import { getAccentColors } from "../genre-artwork/index.js";
import { cacheAlbumImage, cacheTrackImage, getArtistImages, getTrackImages, trackImageKey } from "../image-cache.js";
import type { GenreSearchResult, NormalizedAlbum, NormalizedArtist, NormalizedTrack } from "../types.js";
import { evenSpacedSample, stratifiedSample } from "./sampler.js";

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0";
const MAX_POOL = 50;
const HOT_SPREAD_FACTOR = 3;
const HOT_SPREAD_MIN = 30;

function apiKey(): string {
  const key = process.env.LASTFM_API_KEY;
  if (!key) throw new Error("LASTFM_API_KEY not configured");
  return key;
}

/** Returns true when the Last.fm API key is present. */
export function isLastfmAvailable(): boolean {
  return !!process.env.LASTFM_API_KEY;
}

// ─── Last.fm response shapes ───────────────────────────────────────────────

interface LfmImage {
  "#text": string;
  size: string;
}

interface LfmTrack {
  name: string;
  artist: { name: string; mbid?: string };
  mbid?: string;
  url?: string;
  duration?: string;
  image?: LfmImage[];
}

interface LfmAlbum {
  name: string;
  artist: { name: string; mbid?: string };
  mbid?: string;
  url?: string;
  image?: LfmImage[];
}

interface LfmArtist {
  name: string;
  mbid?: string;
  url?: string;
  image?: LfmImage[];
}

// ─── Non-genre tag blocklist ───────────────────────────────────────────────
//
// Last.fm's top tags include descriptors, demographics, decades, and
// personal-collection labels that are not music genres. Filter these out
// when building the browse grid.

const TAG_BLOCKLIST = new Set([
  "seen live",
  "female vocalists",
  "male vocalists",
  "british",
  "american",
  "german",
  "french",
  "russian",
  "swedish",
  "japanese",
  "canadian",
  "australian",
  "italian",
  "finnish",
  "norwegian",
  "irish",
  "instrumental",
  "acoustic",
  "bookmark",
  "cover",
  "favorites",
  "favourite",
  "albums i own",
  "under 2000 listeners",
  "love",
  "beautiful",
  "mellow",
  "guitar",
  "piano",
  "oldies",
]);

function isGenreTag(name: string): boolean {
  return !TAG_BLOCKLIST.has(name.toLowerCase());
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────

async function lfmFetch<T>(method: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ method, api_key: apiKey(), format: "json", ...params });
  const res = await fetchWithTimeout(`${LASTFM_BASE}/?${qs.toString()}`, {}, 5000);
  if (!res.ok) throw new Error(`Last.fm ${method} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchTopTracks(tag: string, limit: number): Promise<LfmTrack[]> {
  const data = await lfmFetch<{ tracks?: { track?: LfmTrack[] } }>("tag.getTopTracks", {
    tag,
    limit: String(limit),
  });
  return data.tracks?.track ?? [];
}

/**
 * Best-effort cover lookup for a genre: ask Last.fm for its top 5 albums
 * and return the first image we can extract. Used by the genre-artwork
 * route as the color-sampling seed — never surfaced to the user directly
 * anymore, so returning `null` is fine (the artwork generator falls back
 * to a default accent in that case).
 */
export async function getGenreCoverUrl(genre: string): Promise<string | null> {
  try {
    const albums = await fetchTopAlbums(genre, 5);
    for (const album of albums) {
      const url = pickImage(album.image);
      if (url) return url;
    }
  } catch {
    // fall through
  }
  return null;
}

async function fetchTopAlbums(tag: string, limit: number): Promise<LfmAlbum[]> {
  const data = await lfmFetch<{ albums?: { album?: LfmAlbum[] } }>("tag.getTopAlbums", {
    tag,
    limit: String(limit),
  });
  return data.albums?.album ?? [];
}

async function fetchTopArtists(tag: string, limit: number): Promise<LfmArtist[]> {
  const data = await lfmFetch<{ topartists?: { artist?: LfmArtist[] } }>("tag.getTopArtists", {
    tag,
    limit: String(limit),
  });
  return data.topartists?.artist ?? [];
}

// ─── Image helpers ─────────────────────────────────────────────────────────

function pickImage(images: LfmImage[] | undefined): string | undefined {
  if (!images || images.length === 0) return undefined;
  const xl = images.find((i) => i.size === "extralarge");
  const url = xl?.["#text"] || images[images.length - 1]?.["#text"];
  if (!url) return undefined;
  // Last.fm placeholder hash — not a real image
  if (url.includes("2a96cbd8b46e442fc41c2b86b821562f")) return undefined;
  return url;
}

// ─── Mappers ───────────────────────────────────────────────────────────────

function mapTrack(raw: LfmTrack): NormalizedTrack {
  return {
    sourceService: "deezer", // Last.fm URLs won't resolve; use a service the resolve flow can handle
    sourceId: raw.mbid || `lfm-${raw.artist.name}-${raw.name}`,
    title: raw.name,
    artists: [raw.artist.name],
    artworkUrl: undefined, // filled post-mapping via image cache
    durationMs: raw.duration ? Number(raw.duration) * 1000 : undefined,
    webUrl:
      raw.url ?? `https://www.last.fm/music/${encodeURIComponent(raw.artist.name)}/_/${encodeURIComponent(raw.name)}`,
  };
}

function mapAlbum(raw: LfmAlbum): NormalizedAlbum {
  return {
    sourceService: "deezer",
    sourceId: raw.mbid || `lfm-${raw.artist.name}-${raw.name}`,
    title: raw.name,
    artists: [raw.artist.name],
    artworkUrl: pickImage(raw.image),
    webUrl:
      raw.url ?? `https://www.last.fm/music/${encodeURIComponent(raw.artist.name)}/${encodeURIComponent(raw.name)}`,
  };
}

function mapArtist(raw: LfmArtist): NormalizedArtist {
  return {
    sourceService: "deezer",
    sourceId: raw.mbid || `lfm-${raw.name}`,
    name: raw.name,
    imageUrl: undefined, // filled post-mapping via Spotify image cache
    webUrl: raw.url ?? `https://www.last.fm/music/${encodeURIComponent(raw.name)}`,
  };
}

// ─── Dedup + interleave (reused from Deezer/Apple adapters) ────────────────

function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const l of lists) {
      if (i < l.length) out.push(l[i]);
    }
  }
  return out;
}

function dedupeBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = key(it);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(it);
    }
  }
  return out;
}

// ─── Public entry point ────────────────────────────────────────────────────

export interface LastfmGenreSearchInput {
  genres: string[];
  vibe: "hot" | "mixed";
  tracks: number;
  albums: number;
  artists: number;
}

/**
 * Run a genre-search query against Last.fm's tag system.
 *
 * Fetches tracks, albums, and artists for each tag (genre) in parallel,
 * interleaves multi-genre results, dedupes, samples, and enriches with
 * artwork from the permanent image cache.
 */
export async function lastfmSearchByGenre(input: LastfmGenreSearchInput): Promise<GenreSearchResult> {
  if (input.tracks === 0 && input.albums === 0 && input.artists === 0) {
    return { tracks: [], albums: [], artists: [] };
  }

  // Fetch raw data for all genres in parallel
  const perGenre = await Promise.all(
    input.genres.map(async (genre) => {
      const [rawTracks, rawAlbums, rawArtists] = await Promise.all([
        input.tracks > 0 ? fetchTopTracks(genre, MAX_POOL) : Promise.resolve([]),
        input.albums > 0 ? fetchTopAlbums(genre, MAX_POOL) : Promise.resolve([]),
        input.artists > 0 ? fetchTopArtists(genre, MAX_POOL) : Promise.resolve([]),
      ]);
      return {
        tracks: rawTracks.map(mapTrack),
        albums: rawAlbums.map(mapAlbum),
        artists: rawArtists.map(mapArtist),
      };
    }),
  );

  // Interleave + dedupe across genres
  const tracksPool = dedupeBy(interleave(perGenre.map((p) => p.tracks)), (t) =>
    extractPrimaryArtist(t.artists[0] || t.sourceId),
  );
  const albumsPool = dedupeBy(interleave(perGenre.map((p) => p.albums)), (a) => a.sourceId);
  const artistsPool = dedupeBy(interleave(perGenre.map((p) => p.artists)), (a) => a.sourceId);

  // Sample
  const spreadRange = Math.min(
    Math.max(HOT_SPREAD_MIN, HOT_SPREAD_FACTOR * Math.max(input.albums, input.artists)),
    MAX_POOL,
  );

  const finalizeTop = <T>(pool: T[], target: number): T[] => {
    if (target === 0) return [];
    return input.vibe === "mixed" ? stratifiedSample(pool, target) : pool.slice(0, target);
  };
  const finalizeSpread = <T>(pool: T[], target: number): T[] => {
    if (target === 0) return [];
    if (input.vibe === "mixed") return stratifiedSample(pool, target);
    return evenSpacedSample(pool.slice(0, spreadRange), target);
  };

  const finalTracks = finalizeTop(tracksPool, input.tracks);
  const finalAlbums = finalizeSpread(albumsPool, input.albums);
  const finalArtists = finalizeSpread(artistsPool, input.artists);

  // ─── Artwork enrichment (parallel) ─────────────────────────────────────

  const enrichOps: Promise<void>[] = [];

  // Tracks: DB cache first, Last.fm track.getInfo for misses
  if (finalTracks.length > 0) {
    enrichOps.push(
      (async () => {
        const trackKeys = finalTracks.map((t) => ({ artist: t.artists[0], title: t.title }));
        const imageMap = await getTrackImages(trackKeys);
        for (const t of finalTracks) {
          t.artworkUrl = imageMap.get(trackImageKey(t.artists[0], t.title)) ?? t.artworkUrl;
        }
      })(),
    );
  }

  // Albums: write-through cache (Last.fm already provided artwork)
  if (finalAlbums.length > 0) {
    enrichOps.push(
      (async () => {
        for (const a of finalAlbums) {
          if (a.artworkUrl) {
            try {
              await cacheAlbumImage(a.artists[0], a.title, a.artworkUrl, "lastfm");
            } catch {
              // best-effort
            }
          }
        }
      })(),
    );
  }

  // Artists: Spotify-backed image cache
  if (finalArtists.length > 0) {
    enrichOps.push(
      (async () => {
        const imageMap = await getArtistImages(finalArtists.map((a) => a.name));
        for (const a of finalArtists) {
          a.imageUrl = imageMap.get(a.name) ?? a.imageUrl;
        }
      })(),
    );
  }

  await Promise.all(enrichOps);

  // Write-through for tracks that got artwork (for future cache hits)
  for (const t of finalTracks) {
    if (t.artworkUrl) {
      cacheTrackImage(t.artists[0], t.title, t.artworkUrl, "lastfm").catch(() => {});
    }
  }

  log.debug(
    "LastfmGenreSearch",
    `Returned ${finalTracks.length}T/${finalAlbums.length}A/${finalArtists.length}Ar for [${input.genres.join(", ")}]`,
  );

  return {
    tracks: finalTracks,
    albums: finalAlbums,
    artists: finalArtists,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Genre Browse (`genre:?`)
// ═══════════════════════════════════════════════════════════════════════════

export interface GenreTile {
  name: string;
  displayName: string;
  /** Points at `/api/v1/genre-artwork/:genreKey`; the server generates and caches the image on first hit. */
  artworkUrl: string;
  /** Dominant accent derived from the genre's top album cover. Present only when the artwork has already been generated. */
  accentColor?: string;
}

// In-memory cache for the genre browse grid (refreshed every 24h).
let browseCache: { tiles: GenreTile[]; expiresAt: number } | null = null;
let browseCacheInflight: Promise<GenreTile[]> | null = null;
const BROWSE_TTL_MS = 24 * 60 * 60 * 1000;

// Cover URL that the browse-grid builder discovered for each genre key.
// The artwork route consults this map first so a cold-cache artwork burst
// does NOT duplicate the `tag.getTopAlbums` call that the grid build just
// made — in production those duplicate parallel Last.fm calls hit rate
// limits / timeouts and the generator fell through to its blue fallback.
const genreCoverUrls = new Map<string, string>();

/** Look up the cover URL captured during the most recent browse-grid build. */
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
const BROWSE_GENRE_COUNT = 250;

// Decades we always want in the browse grid. Last.fm's top-tags list
// reliably surfaces recent ones (60s-2010s) but older decades rarely
// make the cut, so we inject them as fallback candidates — dedupe picks
// the real Last.fm tag whenever one exists.
const FORCED_DECADE_TAGS: { name: string; reach?: string }[] = [
  { name: "30s" },
  { name: "40s" },
  { name: "50s" },
  { name: "60s" },
  { name: "70s" },
  { name: "80s" },
  { name: "90s" },
];

/**
 * Cache-bust version for artwork URLs. The endpoint's JPEG bytes are
 * served with `Cache-Control: immutable`, so browsers keep old images
 * forever once they've been fetched. Bump this integer whenever the
 * generator algorithm, font, layout, or colour rules change — every
 * tile URL becomes a new cache key and clients refetch.
 */
const ARTWORK_VERSION = 5;

function capitalize(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Hard-coded aliases for genre shortforms whose letters sit directly
 * next to each other — regex normalisation can't tell them apart from a
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
 * Fetch the genre browse grid: popular tags with procedurally generated
 * atmospheric artworks.
 *
 * The tag list is fetched from `chart.getTopTags`, filtered through the
 * blocklist, and checked against `tag.getTopAlbums` to weed out empty
 * genres (those without at least one cover). The tile image is NOT the
 * album cover anymore — each tile points at
 * `/api/v1/genre-artwork/<name>`, which lazily renders a unique image
 * derived from the genre's top album color.
 *
 * Already-generated accents are pulled from the `genre_artworks` table in
 * one batch query and inlined on the tile, so the frontend can colourise
 * the card before the artwork JPEG has finished loading.
 *
 * The result is cached in memory for 24h. Cover URLs keep flowing into
 * the `album_images` table as a side-effect, preserving the permanent
 * cache populated by the old implementation.
 */
export async function getGenreBrowseGrid(): Promise<GenreTile[]> {
  if (browseCache && browseCache.expiresAt > Date.now()) return browseCache.tiles;
  if (browseCacheInflight) return browseCacheInflight;

  browseCacheInflight = (async () => {
    // Fetch a large pool, filter out non-genre tags
    const data = await lfmFetch<{ tags?: { tag?: { name: string; reach?: string }[] } }>("chart.getTopTags", {
      limit: "400",
    });
    const rawCandidates = (data.tags?.tag ?? []).filter((t) => isGenreTag(t.name));

    // Ensure decade tiles are always present even when Last.fm's top-tags
    // call doesn't include them in this window.
    for (const forced of FORCED_DECADE_TAGS) {
      if (!rawCandidates.some((t) => t.name.toLowerCase() === forced.name)) {
        rawCandidates.push(forced);
      }
    }

    // Dedupe tags that canonicalize to the same key (e.g. "Rock and Roll"
    // vs "rock n roll"), keeping the variant with the highest reach.
    const bestByKey = new Map<string, { tag: { name: string; reach?: string }; reach: number }>();
    for (const tag of rawCandidates) {
      const key = canonicalizeGenreKey(tag.name);
      const reach = Number(tag.reach ?? 0);
      const existing = bestByKey.get(key);
      if (!existing || reach > existing.reach) bestByKey.set(key, { tag, reach });
    }
    const candidates = [...bestByKey.values()].map((v) => v.tag);

    // Probe each candidate for at least one album with cover art. This
    // filters out empty genres where the artwork generator would render a
    // default-accent tile that does not reflect any actual music.
    const allTiles = await Promise.all(
      candidates.map(async (tag): Promise<{ tile: GenreTile; hasCover: boolean }> => {
        const name = canonicalizeGenreKey(tag.name);
        let hasCover = false;
        try {
          const albums = await fetchTopAlbums(tag.name, 5);
          for (const album of albums) {
            const url = pickImage(album.image);
            if (url) {
              hasCover = true;
              genreCoverUrls.set(name, url);
              cacheAlbumImage(album.artist.name, album.name, url, "lastfm").catch(() => {});
              break;
            }
          }
        } catch {
          // Best-effort; tile will be dropped below
        }
        return {
          tile: {
            name,
            displayName: capitalize(name),
            // Points at the Astro frontend proxy, NOT the backend directly.
            // The browser resolves this relative URL against the page origin
            // (the Astro host), so the path must be the proxy path. The
            // proxy handler then forwards to `ENDPOINTS.v1.genreArtwork`.
            // `?v=` is a cache-bust — see ARTWORK_VERSION above.
            artworkUrl: `/api/genre-artwork/${encodeURIComponent(name)}?v=${ARTWORK_VERSION}`,
          },
          hasCover,
        };
      }),
    );

    // Keep only tiles backed by real music, trim to target count, sort alphabetically
    const kept = allTiles
      .filter((t) => t.hasCover)
      .slice(0, BROWSE_GENRE_COUNT)
      .map((t) => t.tile)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" }));

    // Inline already-known accent colors from previously generated artworks
    // so the frontend can colourise the card border before the JPEG loads.
    try {
      const accents = await getAccentColors(kept.map((t) => t.name));
      for (const tile of kept) {
        const accent = accents.get(tile.name);
        if (accent) tile.accentColor = accent;
      }
    } catch (err) {
      log.debug("LastfmGenreSearch", `Accent lookup failed: ${(err as Error).message}`);
    }

    log.debug(
      "LastfmGenreSearch",
      `Browse grid: ${kept.length} genres with covers (${allTiles.length - kept.length} dropped)`,
    );
    browseCache = { tiles: kept, expiresAt: Date.now() + BROWSE_TTL_MS };
    return kept;
  })().finally(() => {
    browseCacheInflight = null;
  });

  return browseCacheInflight;
}
