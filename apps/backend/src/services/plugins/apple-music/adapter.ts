/**
 * @file Apple Music adapter: track + album + artist resolves against Apple's API.
 *
 * Credentialed through a signed developer JWT. `token.ts` signs and caches it
 * and holds `appleMusicFetch`, the authenticated request every call here uses.
 * `storefront.ts` holds the storefront cascade for lookups without a
 * URL-derived storefront.
 *
 * ## Storefront-specific IDs
 *
 * Apple Music IDs are scoped to storefronts (countries). The same
 * numeric track ID can exist in one country's catalog and 404 in
 * another, so the adapter encodes the storefront into the ID it
 * returns from `detectUrl` as `{storefront}:{id}` (e.g. `"de:1234"`).
 * `parseStorefrontId` unpacks this on the way back in, ensuring the
 * API call goes against the same storefront the URL came from. Bare
 * numeric IDs (from cache or ISRC lookups) fall back to
 * `APPLE_MUSIC_STOREFRONT` or `"us"`.
 *
 * ## URL shapes
 *
 * Apple Music has two track-URL forms that both need handling:
 * - `music.apple.com/{country}/song/{name}/{trackId}` (canonical song URL)
 * - `music.apple.com/{country}/album/{name}/{albumId}?i={trackId}`
 *   (song-within-album URL, common in Apple's share flows)
 *
 * The regex captures both with separate optional groups; `detectUrl`
 * preferentially extracts the `?i=` track ID before falling back to
 * the `/song/` form.
 *
 * ## Full capability surface
 *
 * Track, album and artist retrieval/search are implemented. Album responses
 * retain UPC metadata and included tracks, but no UPC lookup is implemented.
 * `findByIsrc` uses the catalog songs endpoint with `filter[isrc]`, not text
 * search. A missing search category inside a valid `results` object is empty;
 * an absent root or malformed collection is an upstream failure. Regional 404
 * fallback may end in a completed miss if another storefront answers. Other
 * failed storefronts prevent clean negatives; retained positives log one partial
 * deviation. Required payload errors still throw at their decoder.
 *
 * ## No previews
 *
 * Apple Music answers a song with `previews`, and this adapter leaves them
 * out on purpose. The Apple Developer Program License Agreement (section
 * 3.3.6(D), as of August 2026) allows MusicKit content to play only as the
 * MusicKit APIs or MusicKit JS render it, and musiccloud's player plays and
 * analyzes preview audio in its own audio element. Deezer supplies the
 * previews instead, refreshed on demand by the share-preview route. Decided
 * in issue #290.
 *
 * ## No artwork
 *
 * Apple Music answers every song, album and artist with `artwork`, and this
 * adapter leaves it out as well. The same section of the agreement allows
 * Apple Music artwork only together with MusicKit playback, which musiccloud
 * does not offer. The resolvers borrow the cover of another matched service
 * through `pickRecordingArtworkUrl` in `services/artwork.ts`, and show none where no
 * other service has one. Decided in issue #622.
 */
import { getPlatformLabel, ResourceKind, Service } from "@musiccloud/shared";
import { calculateArtistNameConfidence } from "../../../lib/resolve/normalize";
import { serviceNotFoundError } from "../../../lib/resolve/service-errors";
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
  SearchQuery,
  ServiceAdapter,
} from "../../types.js";
import { scoreAlbumCandidate, scoreSearchCandidate, searchText } from "../_shared/confidence.js";
import { requireProviderCollection } from "../_shared/provider-response.js";
import { searchMatchResult } from "../_shared/rank.js";
import {
  appleMusicHttpError,
  getStorefrontCascade,
  StorefrontCascadeOutcome,
  searchAcrossStorefronts,
} from "./storefront.js";
import { appleMusicFetch } from "./token.js";

/**
 * Apple Music URL regex - URL-based flows (detectUrl / detectAlbumUrl).
 *
 * Matches:
 * - `music.apple.com/{storefront}/album/{name}/{albumId}?i={trackId}`
 * - `music.apple.com/{storefront}/song/{name}/{trackId}`
 *
 * Capture groups:
 * 1. storefront - 2-letter ISO country code (us, de, gb, fr, jp, …); generic,
 *    matches any Apple Music storefront (there are 100+).
 * 2. albumId - numeric id; present for /album/ URLs.
 * 3. trackId (via `?i=`) - numeric id; present when an /album/ URL links a
 *    specific track.
 * 4. trackId (from /song/) - numeric id; present for /song/ URLs.
 */
const APPLE_MUSIC_REGEX =
  /(?:https?:\/\/)?music\.apple\.com\/([a-z]{2})\/(?:album\/[^/]+\/(\d+)(?:\?i=(\d+))?|song\/[^/]+\/(\d+))/;

/**
 * Apple Music artist URL regex.
 *
 * Matches: `music.apple.com/{storefront}/artist/{name}/{artistId}`.
 *
 * Capture groups:
 * 1. storefront - 2-letter ISO country code.
 * 2. artistId - numeric id.
 */
const APPLE_MUSIC_ARTIST_REGEX = /(?:https?:\/\/)?music\.apple\.com\/([a-z]{2})\/artist\/[^/]+\/(\d+)/;

const DEFAULT_STOREFRONT = "us";

/**
 * Apple Music track / album / artist IDs are **storefront-specific**: the same
 * numeric ID may exist in one country's catalog and return 404 in another.
 * Resolving a URL against the wrong storefront therefore fails with a confusing
 * "not found" even though the item exists in its own storefront.
 *
 * Flow:
 * 1. `detectUrl` / `detectAlbumUrl` / `detectArtistUrl` extract the storefront
 *    from the URL and encode it into the returned id as `{storefront}:{id}`.
 * 2. The resolver passes that composite straight back to
 *    `getTrack` / `getAlbum` / `getArtist`.
 * 3. `parseStorefrontId` splits it apart; the API call is issued against the
 *    same storefront the URL came from.
 * 4. `mapTrack` / `mapAlbum` / `mapArtist` store the bare numeric id as
 *    `sourceId` - no composite leaks into the DB.
 *
 * Fallback: when called with a bare numeric id (no storefront prefix - e.g.
 * from a cache or from `findByIsrc`), we use `APPLE_MUSIC_STOREFRONT` env or
 * `DEFAULT_STOREFRONT` ("us"). The id format is generic - any 2-letter ISO
 * code works, not just the ones seen in tests.
 */
function parseStorefrontId(input: string): { storefront: string; id: string } {
  const colonIdx = input.indexOf(":");
  if (colonIdx > 0 && /^[a-z]{2}$/i.test(input.slice(0, colonIdx))) {
    return { storefront: input.slice(0, colonIdx).toLowerCase(), id: input.slice(colonIdx + 1) };
  }
  return { storefront: process.env.APPLE_MUSIC_STOREFRONT ?? DEFAULT_STOREFRONT, id: input };
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

  // No `artworkUrl`: Apple's artwork is left out, see the file comment.
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
    webUrl: attrs.url,
  };
}

function mapAlbum(raw: AppleMusicAlbumResource): NormalizedAlbum {
  const attrs = raw.attributes;

  const tracks: AlbumTrackEntry[] | undefined = raw.relationships?.tracks?.data
    ?.filter((t) => t.attributes != null)
    .map((t, idx) => ({
      title: t.attributes?.name ?? "Unknown Track",
      isrc: t.attributes?.isrc,
      trackNumber: t.attributes?.trackNumber ?? idx + 1,
      durationMs: t.attributes?.durationInMillis,
    }));

  // No `artworkUrl`: Apple's artwork is left out, see the file comment.
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
    label: attrs.recordLabel,
    webUrl: attrs.url,
    tracks: tracks?.length ? tracks : undefined,
  };
}

const capabilities: AdapterCapabilities = {
  supportsIsrc: true,
  // Apple's previews and artwork are left out; see the file comment.
  supportsPreview: false,
  supportsArtwork: false,
};

const albumCapabilities: AlbumCapabilities = {
  // Returning UPC metadata does not implement findAlbumByUpc.
  supportsUpc: false,
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
}

interface AppleMusicArtistResource {
  id: string;
  type: "artists";
  attributes: AppleMusicArtistAttributes;
}

function mapArtist(raw: AppleMusicArtistResource): NormalizedArtist {
  const attrs = raw.attributes;

  // No `imageUrl`: Apple's artwork is left out, see the file comment.
  return {
    sourceService: "apple-music",
    sourceId: raw.id,
    name: attrs.name,
    genres: attrs.genreNames?.filter((g) => g !== "Music"),
    webUrl: attrs.url,
  };
}

export const appleMusicAdapter: ServiceAdapter = {
  id: "apple-music",
  displayName: getPlatformLabel("apple-music"),
  capabilities,
  albumCapabilities,
  artistCapabilities,

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
   * Drops the storefront from an id `detectUrl` or `detectAlbumUrl` returned,
   * because the mappers store the bare numeric id as `sourceId` (see
   * {@link parseStorefrontId}).
   */
  toCatalogId(detectedId: string): string {
    return parseStorefrontId(detectedId).id;
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
      throw appleMusicHttpError(response.status, ResourceKind.Track, id, storefront);
    }

    const data = await response.json();
    const song: AppleMusicSongResource = data.data[0];

    if (!song) {
      const err = serviceNotFoundError(Service.AppleMusic, ResourceKind.Track, id, `storefront=${storefront}`);
      if (err.context) (err.context as Record<string, string | number>).storefront = storefront;
      throw err;
    }

    return mapTrack(song);
  },

  /**
   * ISRC lookup - used by the resolver when matching a source track from
   * another service to its Apple Music counterpart.
   *
   * Cascades through {@link getStorefrontCascade} (ISRC country → env default →
   * fallback list) and returns the first non-empty hit. ISRC matches are
   * exact, so the first store that has the track is the right answer; we don't
   * need to compare across stores.
   */
  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const cascade = new StorefrontCascadeOutcome();
    for (const storefront of getStorefrontCascade(isrc)) {
      const response = await appleMusicFetch(`/catalog/${storefront}/songs?filter[isrc]=${encodeURIComponent(isrc)}`);
      if (!cascade.record(response, storefront)) continue;

      const data = await response.json();
      const songs = requireProviderCollection<AppleMusicSongResource>(data.data, Service.AppleMusic, "ISRC lookup");
      if (songs.length === 0) continue;

      const track = mapTrack(songs[0]);
      cascade.throwIfUnresolved(ResourceKind.Track, isrc, true);
      return track;
    }
    cascade.throwIfUnresolved(ResourceKind.Track, isrc);
    return null;
  },

  /**
   * Text search for a track. Cascades across storefronts (see
   * {@link getStorefrontCascade}) keeping the best match across all attempted
   * stores; early-exits once a match reaches
   * `SEARCH_EARLY_EXIT_CONFIDENCE` in `storefront.ts` so the common case stays fast.
   */
  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const text = searchText(query);
    return searchAcrossStorefronts({
      category: "songs",
      term: encodeURIComponent(query.album ? `${text} ${query.album}` : text),
      kind: ResourceKind.Track,
      id: query.title,
      map: mapTrack,
      score: (track, index) => scoreSearchCandidate(query, track, index),
      toResult: (best, confidence) => searchMatchResult("track", best, confidence),
    });
  },

  /**
   * Accepts a composite id `{storefront}:{albumId}` from {@link detectAlbumUrl}
   * or a bare numeric albumId (falls back to default storefront).
   */
  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const { storefront, id } = parseStorefrontId(albumId);
    const response = await appleMusicFetch(`/catalog/${storefront}/albums/${encodeURIComponent(id)}?include=tracks`);

    if (!response.ok) {
      throw appleMusicHttpError(response.status, ResourceKind.Album, id, storefront);
    }

    const data = await response.json();
    const album: AppleMusicAlbumResource = data.data[0];

    if (!album) {
      const err = serviceNotFoundError(Service.AppleMusic, ResourceKind.Album, id, `storefront=${storefront}`);
      if (err.context) (err.context as Record<string, string | number>).storefront = storefront;
      throw err;
    }

    return mapAlbum(album);
  },

  /**
   * Text search for an album. Storefront-cascading mirror of
   * {@link searchTrack} - see that method for the cascade strategy.
   */
  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    return searchAcrossStorefronts({
      category: "albums",
      term: encodeURIComponent(`${query.artist} ${query.title}`),
      kind: ResourceKind.Album,
      id: query.title,
      map: mapAlbum,
      score: (album) => scoreAlbumCandidate(query, album),
      toResult: (best, confidence) => searchMatchResult("album", best, confidence),
    });
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
      throw appleMusicHttpError(response.status, ResourceKind.Artist, id, storefront);
    }

    const data = await response.json();
    const artist: AppleMusicArtistResource = data.data[0];

    if (!artist) {
      const err = serviceNotFoundError(Service.AppleMusic, ResourceKind.Artist, id, `storefront=${storefront}`);
      if (err.context) (err.context as Record<string, string | number>).storefront = storefront;
      throw err;
    }

    return mapArtist(artist);
  },

  /**
   * Text search for an artist. Storefront-cascading mirror of
   * {@link searchTrack} - see that method for the cascade strategy.
   */
  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    return searchAcrossStorefronts({
      category: "artists",
      term: encodeURIComponent(query.name),
      kind: ResourceKind.Artist,
      id: query.name,
      map: mapArtist,
      score: (artist) => calculateArtistNameConfidence(query.name, artist.name),
      toResult: (best, confidence) => searchMatchResult("artist", best, confidence),
    });
  },
};
