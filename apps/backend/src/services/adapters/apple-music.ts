import { importPKCS8, SignJWT } from "jose";
import { fetchWithTimeout } from "../../lib/infra/fetch";
import { calculateConfidence } from "../../lib/resolve/normalize";
import type {
  AdapterCapabilities,
  AlbumCapabilities,
  AlbumMatchResult,
  AlbumSearchQuery,
  AlbumTrackEntry,
  ArtistCapabilities,
  ArtistMatchResult,
  ArtistSearchQuery,
  MatchResult,
  NormalizedAlbum,
  NormalizedArtist,
  NormalizedTrack,
  ServiceAdapter,
} from "../types.js";

/**
 * Apple Music URL regex — URL-based flows (detectUrl / detectAlbumUrl).
 *
 * Matches:
 * - `music.apple.com/{storefront}/album/{name}/{albumId}?i={trackId}`
 * - `music.apple.com/{storefront}/song/{name}/{trackId}`
 *
 * Capture groups:
 * 1. storefront — 2-letter ISO country code (us, de, gb, fr, jp, …); generic,
 *    matches any Apple Music storefront (there are 100+).
 * 2. albumId — numeric id; present for /album/ URLs.
 * 3. trackId (via `?i=`) — numeric id; present when an /album/ URL links a
 *    specific track.
 * 4. trackId (from /song/) — numeric id; present for /song/ URLs.
 */
const APPLE_MUSIC_REGEX =
  /(?:https?:\/\/)?music\.apple\.com\/([a-z]{2})\/(?:album\/[^/]+\/(\d+)(?:\?i=(\d+))?|song\/[^/]+\/(\d+))/;

/**
 * Apple Music artist URL regex.
 *
 * Matches: `music.apple.com/{storefront}/artist/{name}/{artistId}`.
 *
 * Capture groups:
 * 1. storefront — 2-letter ISO country code.
 * 2. artistId — numeric id.
 */
const APPLE_MUSIC_ARTIST_REGEX = /(?:https?:\/\/)?music\.apple\.com\/([a-z]{2})\/artist\/[^/]+\/(\d+)/;

const API_BASE = "https://api.music.apple.com/v1";
const DEFAULT_STOREFRONT = "us";

/**
 * Apple Music track / album / artist IDs are **storefront-specific**: the same
 * numeric ID may exist in one country's catalog and return 404 in another.
 * Resolving a URL against the wrong storefront therefore fails with a confusing
 * "not found" — even though the item is perfectly legal in its own region.
 *
 * Flow:
 * 1. `detectUrl` / `detectAlbumUrl` / `detectArtistUrl` extract the storefront
 *    from the URL and encode it into the returned id as `{storefront}:{id}`.
 * 2. The resolver passes that composite straight back to
 *    `getTrack` / `getAlbum` / `getArtist`.
 * 3. `parseStorefrontId` splits it apart; the API call is issued against the
 *    same storefront the URL came from.
 * 4. `mapTrack` / `mapAlbum` / `mapArtist` store the bare numeric id as
 *    `sourceId` — no composite leaks into the DB.
 *
 * Fallback: when called with a bare numeric id (no storefront prefix — e.g.
 * from a cache or from `findByIsrc`), we use `APPLE_MUSIC_STOREFRONT` env or
 * `DEFAULT_STOREFRONT` ("us"). The id format is generic — any 2-letter ISO
 * code works, not just the ones seen in tests.
 */
function parseStorefrontId(input: string): { storefront: string; id: string } {
  const colonIdx = input.indexOf(":");
  if (colonIdx > 0 && /^[a-z]{2}$/i.test(input.slice(0, colonIdx))) {
    return { storefront: input.slice(0, colonIdx).toLowerCase(), id: input.slice(colonIdx + 1) };
  }
  return { storefront: process.env.APPLE_MUSIC_STOREFRONT ?? DEFAULT_STOREFRONT, id: input };
}

/**
 * Fallback storefronts for cross-service queries that have no URL-derived
 * storefront (i.e. {@link findByIsrc}, {@link searchTrack}, {@link searchAlbum},
 * {@link searchArtist}). Ordered by global catalog size; the cascade is bounded
 * to keep latency predictable.
 */
const FALLBACK_STOREFRONTS = ["us", "gb", "de", "jp", "fr"] as const;

/**
 * Maximum number of storefronts to query in a cascade. Each step costs one
 * sequential API round-trip (~150-300ms), so 5 caps worst-case latency at
 * ~1-2s. Most queries hit on the first store and never reach the cap.
 */
const STOREFRONT_CASCADE_LIMIT = 5;

/**
 * Builds the priority-ordered storefront list for catalog/search queries that
 * don't carry a storefront in the URL. Apple Music's catalog and search index
 * are per-storefront — a track present in `de` is invisible to a `us` query.
 *
 * Priority:
 * 1. ISRC country code (registrant — strongest signal when present)
 * 2. APPLE_MUSIC_STOREFRONT env override (operator preference)
 * 3. {@link FALLBACK_STOREFRONTS} (large global catalogs)
 *
 * Notes:
 * - ISRC country codes are ISO 3166-1 alpha-2, matching Apple's storefront
 *   codes 1:1 for the common cases (DE, US, GB, JP, FR, …). Synthetic prefixes
 *   like `QM*`/`ZA*` are accepted but the API will simply return no results
 *   for unknown storefronts; the cascade then falls through to the next entry.
 * - The list is deduped (case-insensitive) and capped at
 *   {@link STOREFRONT_CASCADE_LIMIT}.
 */
function getStorefrontCascade(isrcHint?: string): string[] {
  const out: string[] = [];
  const add = (s: string | null | undefined): void => {
    const v = s?.toLowerCase();
    if (v && /^[a-z]{2}$/.test(v) && !out.includes(v)) out.push(v);
  };

  if (isrcHint && isrcHint.length >= 2) add(isrcHint.slice(0, 2));
  add(process.env.APPLE_MUSIC_STOREFRONT);
  for (const s of FALLBACK_STOREFRONTS) add(s);
  return out.slice(0, STOREFRONT_CASCADE_LIMIT);
}

/** Confidence at/above which {@link searchTrack} et al. early-exit the cascade. */
const SEARCH_EARLY_EXIT_CONFIDENCE = 0.85;

// Token cache: JWT is valid for 1 hour, we refresh 5 minutes early
const TOKEN_LIFETIME_SECONDS = 3600;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CachedJwt {
  token: string;
  expiresAt: number;
}

let cachedJwt: CachedJwt | null = null;
let tokenPromise: Promise<string> | null = null;

async function generateToken(): Promise<string> {
  // Legacy: support pre-generated static token for development
  const staticToken = process.env.APPLE_MUSIC_TOKEN;
  if (staticToken) {
    cachedJwt = { token: staticToken, expiresAt: Date.now() + TOKEN_LIFETIME_SECONDS * 1000 };
    return staticToken;
  }

  // Generate JWT from MusicKit credentials
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const privateKeyPem = process.env.APPLE_MUSIC_PRIVATE_KEY;

  if (!keyId || !teamId || !privateKeyPem) {
    throw new Error("Apple Music requires APPLE_MUSIC_KEY_ID + APPLE_MUSIC_TEAM_ID + APPLE_MUSIC_PRIVATE_KEY");
  }

  // The private key may be base64-encoded or raw PEM.
  // Decode if it doesn't start with "-----BEGIN".
  // Also replace literal \n sequences (common in .env files) with actual newlines.
  const rawPem = privateKeyPem.startsWith("-----BEGIN")
    ? privateKeyPem
    : Buffer.from(privateKeyPem, "base64").toString("utf-8");
  const pem = rawPem.replace(/\\n/g, "\n");

  const privateKey = await importPKCS8(pem, "ES256");

  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_LIFETIME_SECONDS)
    .sign(privateKey);

  cachedJwt = {
    token,
    expiresAt: Date.now() + TOKEN_LIFETIME_SECONDS * 1000,
  };

  return token;
}

async function getDevToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedJwt && Date.now() < cachedJwt.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
    return cachedJwt.token;
  }
  // Coalesce parallel refresh requests into one promise
  if (tokenPromise) return tokenPromise;
  tokenPromise = generateToken().finally(() => {
    tokenPromise = null;
  });
  return tokenPromise;
}

/** Pre-warm the developer token at startup to avoid first-request latency. */
export async function warmAppleMusicToken(): Promise<void> {
  if (!appleMusicAdapter.isAvailable()) return;
  try {
    await getDevToken();
    console.log("[Apple Music] Developer token pre-warmed");
  } catch (e) {
    console.error("[Apple Music] Token pre-warm failed:", (e as Error).message);
  }
}

async function appleMusicFetch(endpoint: string): Promise<Response> {
  const token = await getDevToken();
  return fetchWithTimeout(
    `${API_BASE}${endpoint}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
    5000,
  );
}

interface AppleMusicSongAttributes {
  name: string;
  artistName: string;
  albumName?: string;
  durationInMillis?: number;
  releaseDate?: string;
  isrc?: string;
  contentRating?: string;
  url: string;
  artwork?: {
    url: string;
    width: number;
    height: number;
  };
  previews?: Array<{ url: string }>;
  genreNames?: string[];
}

interface AppleMusicSongResource {
  id: string;
  type: "songs";
  attributes: AppleMusicSongAttributes;
}

interface AppleMusicAlbumAttributes {
  name: string;
  artistName: string;
  upc?: string;
  trackCount?: number;
  releaseDate?: string;
  artwork?: {
    url: string;
    width: number;
    height: number;
  };
  url: string;
  genreNames?: string[];
  recordLabel?: string;
}

interface AppleMusicAlbumResource {
  id: string;
  type: "albums";
  attributes: AppleMusicAlbumAttributes;
  relationships?: {
    tracks?: {
      data: Array<{
        id: string;
        type: "songs";
        attributes?: {
          name: string;
          isrc?: string;
          trackNumber?: number;
          durationInMillis?: number;
        };
      }>;
    };
  };
}

function mapTrack(raw: AppleMusicSongResource): NormalizedTrack {
  const attrs = raw.attributes;
  let artworkUrl: string | undefined;

  if (attrs.artwork?.url) {
    // Apple Music artwork URLs use {w}x{h} placeholders for dynamic sizing
    artworkUrl = attrs.artwork.url.replace("{w}", "640").replace("{h}", "640");
  }

  return {
    sourceService: "apple-music",
    sourceId: raw.id,
    isrc: attrs.isrc,
    title: attrs.name,
    artists: attrs.artistName
      .split(/,\s*/)
      .map((a) => a.trim())
      .filter(Boolean),
    albumName: attrs.albumName,
    durationMs: attrs.durationInMillis,
    releaseDate: attrs.releaseDate,
    isExplicit: attrs.contentRating === "explicit",
    artworkUrl,
    previewUrl: attrs.previews?.[0]?.url,
    webUrl: attrs.url,
  };
}

function mapAlbum(raw: AppleMusicAlbumResource): NormalizedAlbum {
  const attrs = raw.attributes;
  let artworkUrl: string | undefined;

  if (attrs.artwork?.url) {
    artworkUrl = attrs.artwork.url.replace("{w}", "640").replace("{h}", "640");
  }

  const tracks: AlbumTrackEntry[] | undefined = raw.relationships?.tracks?.data
    ?.filter((t) => t.attributes != null)
    .map((t, idx) => ({
      title: t.attributes?.name ?? "Unknown Track",
      isrc: t.attributes?.isrc,
      trackNumber: t.attributes?.trackNumber ?? idx + 1,
      durationMs: t.attributes?.durationInMillis,
    }));

  return {
    sourceService: "apple-music",
    sourceId: raw.id,
    upc: attrs.upc,
    title: attrs.name,
    artists: attrs.artistName
      .split(/,\s*/)
      .map((a) => a.trim())
      .filter(Boolean),
    releaseDate: attrs.releaseDate,
    totalTracks: attrs.trackCount,
    artworkUrl,
    label: attrs.recordLabel,
    webUrl: attrs.url,
    tracks: tracks?.length ? tracks : undefined,
  };
}

const capabilities: AdapterCapabilities = {
  supportsIsrc: true,
  supportsPreview: true,
  supportsArtwork: true,
};

const albumCapabilities: AlbumCapabilities = {
  supportsUpc: true,
  supportsAlbumSearch: true,
  supportsTrackListing: true,
};

const artistCapabilities: ArtistCapabilities = {
  supportsArtistSearch: true,
};

interface AppleMusicArtistAttributes {
  name: string;
  url: string;
  genreNames?: string[];
  artwork?: {
    url: string;
    width: number;
    height: number;
  };
}

interface AppleMusicArtistResource {
  id: string;
  type: "artists";
  attributes: AppleMusicArtistAttributes;
}

function mapArtist(raw: AppleMusicArtistResource): NormalizedArtist {
  const attrs = raw.attributes;
  let imageUrl: string | undefined;

  if (attrs.artwork?.url) {
    imageUrl = attrs.artwork.url.replace("{w}", "640").replace("{h}", "640");
  }

  return {
    sourceService: "apple-music",
    sourceId: raw.id,
    name: attrs.name,
    imageUrl,
    genres: attrs.genreNames?.filter((g) => g !== "Music"),
    webUrl: attrs.url,
  };
}

export const appleMusicAdapter: ServiceAdapter = {
  id: "apple-music",
  displayName: "Apple Music",
  capabilities,
  albumCapabilities,
  artistCapabilities,

  isAvailable(): boolean {
    return Boolean(
      process.env.APPLE_MUSIC_TOKEN ||
        (process.env.APPLE_MUSIC_KEY_ID && process.env.APPLE_MUSIC_TEAM_ID && process.env.APPLE_MUSIC_PRIVATE_KEY),
    );
  },

  /**
   * Returns the track id encoded as `{storefront}:{trackId}` (see
   * {@link parseStorefrontId}). Returning just the numeric id would lose the
   * storefront and cause `getTrack` to fail for any region the default
   * storefront doesn't cover (e.g. DE-only tracks when env defaults to `us`).
   */
  detectUrl(url: string): string | null {
    const match = APPLE_MUSIC_REGEX.exec(url);
    if (!match) return null;

    // Track ID is either ?i= param (from album link) or direct song ID
    const trackId = match[3] ?? match[4];
    if (trackId) return `${match[1]}:${trackId}`;

    // Album-only link without ?i= - not a track link
    return null;
  },

  /**
   * Returns the album id encoded as `{storefront}:{albumId}`. See
   * {@link detectUrl} for why the storefront must travel with the id.
   */
  detectAlbumUrl(url: string): string | null {
    const match = APPLE_MUSIC_REGEX.exec(url);
    if (!match) return null;

    // Album-only link: has albumId (match[2]) but no ?i= track param (match[3])
    if (match[2] && !match[3]) return `${match[1]}:${match[2]}`;

    return null;
  },

  /**
   * Accepts either a composite id `{storefront}:{trackId}` (preferred, produced
   * by {@link detectUrl}) or a bare numeric trackId (falls back to default
   * storefront). The API call targets the extracted storefront so regional
   * tracks resolve correctly.
   */
  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const { storefront, id } = parseStorefrontId(trackId);
    const response = await appleMusicFetch(`/catalog/${storefront}/songs/${encodeURIComponent(id)}`);

    if (!response.ok) {
      throw new Error(`Apple Music getTrack failed: ${response.status}`);
    }

    const data = await response.json();
    const song: AppleMusicSongResource = data.data[0];

    if (!song) {
      throw new Error(`Apple Music track not found: ${id}`);
    }

    return mapTrack(song);
  },

  /**
   * ISRC lookup — used by the resolver when matching a source track from
   * another service to its Apple Music counterpart.
   *
   * Cascades through {@link getStorefrontCascade} (ISRC country → env default →
   * fallback list) and returns the first non-empty hit. ISRC matches are
   * exact, so the first store that has the track is the right answer; we don't
   * need to compare across stores.
   */
  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    for (const storefront of getStorefrontCascade(isrc)) {
      const response = await appleMusicFetch(`/catalog/${storefront}/songs?filter[isrc]=${encodeURIComponent(isrc)}`);
      if (!response.ok) continue;

      const data = await response.json();
      const songs: AppleMusicSongResource[] = data.data ?? [];
      if (songs.length === 0) continue;

      return mapTrack(songs[0]);
    }
    return null;
  },

  /**
   * Text search for a track. Cascades across storefronts (see
   * {@link getStorefrontCascade}) keeping the best match across all attempted
   * stores; early-exits once a match reaches
   * {@link SEARCH_EARLY_EXIT_CONFIDENCE} so the common case stays fast.
   */
  async searchTrack(query: { title: string; artist: string; album?: string }): Promise<MatchResult> {
    const term = encodeURIComponent(`${query.artist} ${query.title}`);
    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (const storefront of getStorefrontCascade()) {
      const response = await appleMusicFetch(`/catalog/${storefront}/search?types=songs&term=${term}&limit=5`);
      if (!response.ok) continue;

      const data = await response.json();
      const songs: AppleMusicSongResource[] = data.results?.songs?.data ?? [];

      for (const song of songs) {
        const track = mapTrack(song);
        const confidence = calculateConfidence(
          { title: query.title, artists: [query.artist], durationMs: undefined },
          { title: track.title, artists: track.artists, durationMs: track.durationMs },
        );

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = track;
        }
      }

      if (bestConfidence >= SEARCH_EARLY_EXIT_CONFIDENCE) break;
    }

    if (!bestMatch || bestConfidence < 0.6) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return {
      found: true,
      track: bestMatch,
      confidence: bestConfidence,
      matchMethod: "search",
    };
  },

  /**
   * Accepts a composite id `{storefront}:{albumId}` from {@link detectAlbumUrl}
   * or a bare numeric albumId (falls back to default storefront).
   */
  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const { storefront, id } = parseStorefrontId(albumId);
    const response = await appleMusicFetch(`/catalog/${storefront}/albums/${encodeURIComponent(id)}?include=tracks`);

    if (!response.ok) {
      throw new Error(`Apple Music getAlbum failed: ${response.status}`);
    }

    const data = await response.json();
    const album: AppleMusicAlbumResource = data.data[0];

    if (!album) {
      throw new Error(`Apple Music album not found: ${id}`);
    }

    return mapAlbum(album);
  },

  /**
   * Text search for an album. Storefront-cascading mirror of
   * {@link searchTrack} — see that method for the cascade strategy.
   */
  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const term = encodeURIComponent(`${query.artist} ${query.title}`);
    let bestMatch: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (const storefront of getStorefrontCascade()) {
      const response = await appleMusicFetch(`/catalog/${storefront}/search?types=albums&term=${term}&limit=5`);
      if (!response.ok) continue;

      const data = await response.json();
      const albums: AppleMusicAlbumResource[] = data.results?.albums?.data ?? [];

      for (const album of albums) {
        const normalized = mapAlbum(album);
        const confidence = calculateConfidence(
          { title: query.title, artists: [query.artist], durationMs: undefined },
          { title: normalized.title, artists: normalized.artists, durationMs: undefined },
        );

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = normalized;
        }
      }

      if (bestConfidence >= SEARCH_EARLY_EXIT_CONFIDENCE) break;
    }

    if (!bestMatch || bestConfidence < 0.6) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return {
      found: true,
      album: bestMatch,
      confidence: bestConfidence,
      matchMethod: "search",
    };
  },

  /**
   * Returns the artist id encoded as `{storefront}:{artistId}`. See
   * {@link detectUrl} for why the storefront must travel with the id.
   */
  detectArtistUrl(url: string): string | null {
    const match = APPLE_MUSIC_ARTIST_REGEX.exec(url);
    return match ? `${match[1]}:${match[2]}` : null;
  },

  /**
   * Accepts a composite id `{storefront}:{artistId}` from {@link detectArtistUrl}
   * or a bare numeric artistId (falls back to default storefront).
   */
  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const { storefront, id } = parseStorefrontId(artistId);
    const response = await appleMusicFetch(`/catalog/${storefront}/artists/${encodeURIComponent(id)}`);

    if (!response.ok) {
      throw new Error(`Apple Music getArtist failed: ${response.status}`);
    }

    const data = await response.json();
    const artist: AppleMusicArtistResource = data.data[0];

    if (!artist) {
      throw new Error(`Apple Music artist not found: ${id}`);
    }

    return mapArtist(artist);
  },

  /**
   * Text search for an artist. Storefront-cascading mirror of
   * {@link searchTrack} — see that method for the cascade strategy.
   */
  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const term = encodeURIComponent(query.name);
    let bestMatch: NormalizedArtist | null = null;
    let bestConfidence = 0;

    for (const storefront of getStorefrontCascade()) {
      const response = await appleMusicFetch(`/catalog/${storefront}/search?types=artists&term=${term}&limit=5`);
      if (!response.ok) continue;

      const data = await response.json();
      const artists: AppleMusicArtistResource[] = data.results?.artists?.data ?? [];

      for (const raw of artists) {
        const artist = mapArtist(raw);
        const confidence = calculateConfidence(
          { title: query.name, artists: [], durationMs: undefined },
          { title: artist.name, artists: [], durationMs: undefined },
        );

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = artist;
        }
      }

      if (bestConfidence >= SEARCH_EARLY_EXIT_CONFIDENCE) break;
    }

    if (!bestMatch || bestConfidence < 0.6) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return {
      found: true,
      artist: bestMatch,
      confidence: bestConfidence,
      matchMethod: "search",
    };
  },
};
