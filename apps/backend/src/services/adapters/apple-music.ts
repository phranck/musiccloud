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

// Matches: music.apple.com/{storefront}/album/{name}/{albumId}?i={trackId}
//          music.apple.com/{storefront}/song/{name}/{trackId}
const APPLE_MUSIC_REGEX =
  /(?:https?:\/\/)?music\.apple\.com\/([a-z]{2})\/(?:album\/[^/]+\/(\d+)(?:\?i=(\d+))?|song\/[^/]+\/(\d+))/;

// Matches: music.apple.com/{storefront}/artist/{name}/{artistId}
const APPLE_MUSIC_ARTIST_REGEX = /(?:https?:\/\/)?music\.apple\.com\/([a-z]{2})\/artist\/[^/]+\/(\d+)/;

const API_BASE = "https://api.music.apple.com/v1";
const DEFAULT_STOREFRONT = "us";

/**
 * Apple Music track/album/artist IDs are storefront-specific — the same numeric
 * ID may exist in one store but return 404 in another. `detectUrl` extracts the
 * storefront from the URL and encodes it into the returned id as `{storefront}:{id}`
 * so that `getTrack`/`getAlbum`/`getArtist` can issue the API call against the
 * correct storefront. When called with a bare numeric id (no prefix), we fall
 * back to the env/default storefront.
 */
function parseStorefrontId(input: string): { storefront: string; id: string } {
  const colonIdx = input.indexOf(":");
  if (colonIdx > 0 && /^[a-z]{2}$/i.test(input.slice(0, colonIdx))) {
    return { storefront: input.slice(0, colonIdx).toLowerCase(), id: input.slice(colonIdx + 1) };
  }
  return { storefront: process.env.APPLE_MUSIC_STOREFRONT ?? DEFAULT_STOREFRONT, id: input };
}

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

  detectUrl(url: string): string | null {
    const match = APPLE_MUSIC_REGEX.exec(url);
    if (!match) return null;

    // Track ID is either ?i= param (from album link) or direct song ID
    const trackId = match[3] ?? match[4];
    if (trackId) return `${match[1]}:${trackId}`;

    // Album-only link without ?i= - not a track link
    return null;
  },

  detectAlbumUrl(url: string): string | null {
    const match = APPLE_MUSIC_REGEX.exec(url);
    if (!match) return null;

    // Album-only link: has albumId (match[2]) but no ?i= track param (match[3])
    if (match[2] && !match[3]) return `${match[1]}:${match[2]}`;

    return null;
  },

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

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const storefront = process.env.APPLE_MUSIC_STOREFRONT ?? DEFAULT_STOREFRONT;
    const response = await appleMusicFetch(`/catalog/${storefront}/songs?filter[isrc]=${encodeURIComponent(isrc)}`);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const songs: AppleMusicSongResource[] = data.data ?? [];

    if (songs.length === 0) return null;

    return mapTrack(songs[0]);
  },

  async searchTrack(query: { title: string; artist: string; album?: string }): Promise<MatchResult> {
    const storefront = process.env.APPLE_MUSIC_STOREFRONT ?? DEFAULT_STOREFRONT;
    const term = encodeURIComponent(`${query.artist} ${query.title}`);
    const response = await appleMusicFetch(`/catalog/${storefront}/search?types=songs&term=${term}&limit=5`);

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = await response.json();
    const songs: AppleMusicSongResource[] = data.results?.songs?.data ?? [];

    if (songs.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

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

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const storefront = process.env.APPLE_MUSIC_STOREFRONT ?? DEFAULT_STOREFRONT;
    const term = encodeURIComponent(`${query.artist} ${query.title}`);
    const response = await appleMusicFetch(`/catalog/${storefront}/search?types=albums&term=${term}&limit=5`);

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = await response.json();
    const albums: AppleMusicAlbumResource[] = data.results?.albums?.data ?? [];

    if (albums.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestMatch: NormalizedAlbum | null = null;
    let bestConfidence = 0;

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

  detectArtistUrl(url: string): string | null {
    const match = APPLE_MUSIC_ARTIST_REGEX.exec(url);
    return match ? `${match[1]}:${match[2]}` : null;
  },

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

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const storefront = process.env.APPLE_MUSIC_STOREFRONT ?? DEFAULT_STOREFRONT;
    const term = encodeURIComponent(query.name);
    const response = await appleMusicFetch(`/catalog/${storefront}/search?types=artists&term=${term}&limit=5`);

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = await response.json();
    const artists: AppleMusicArtistResource[] = data.results?.artists?.data ?? [];

    if (artists.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestMatch: NormalizedArtist | null = null;
    let bestConfidence = 0;

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
