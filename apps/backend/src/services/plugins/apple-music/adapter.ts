/**
 * @file Apple Music adapter: track + album + artist resolves against Apple's API.
 *
 * Credentialed, but the auth flow differs from OAuth-based services:
 * Apple Music uses a signed developer JWT rather than a client_id /
 * client_secret exchange. Required env vars:
 *
 * - `APPLE_MUSIC_KEY_ID`: 10-char key identifier from App Store Connect
 * - `APPLE_MUSIC_TEAM_ID`: 10-char team identifier
 * - `APPLE_MUSIC_PRIVATE_KEY`: the contents of the downloaded `.p8`
 *   private key (PKCS#8 PEM). Line breaks can be `\n`-escaped when
 *   the env var is set from a config UI; the loader handles both.
 *
 * `generateToken` signs with `jose`/ES256 or uses `APPLE_MUSIC_TOKEN`.
 * `getDevToken` owns the in-process cache and coalesces refreshes; its lifetime
 * and refresh margin are the constants beside that implementation, not a
 * catalog-cache lifetime. `warmAppleMusicToken` can prepare it at startup.
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
import { importPKCS8, SignJWT } from "jose";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { ResolveError } from "../../../lib/resolve/errors";
import { calculateArtistNameConfidence } from "../../../lib/resolve/normalize";
import { serviceHttpError, serviceNotFoundError } from "../../../lib/resolve/service-errors";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
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
import { requireProviderCollection, requireProviderObject } from "../_shared/provider-response.js";

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

const API_BASE = "https://api.music.apple.com/v1";
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

/**
 * Fallback storefronts for cross-service queries that have no URL-derived
 * storefront (i.e. {@link findByIsrc}, {@link searchTrack}, {@link searchAlbum},
 * {@link searchArtist}). This is an explicit fallback sequence, not a claim
 * about catalog-size ranking. The attempt count is bounded.
 */
const FALLBACK_STOREFRONTS = ["us", "gb", "de", "jp", "fr"] as const;

/**
 * Maximum storefront attempts. Request timeouts belong to appleMusicFetch;
 * this bounds request count, not a guaranteed end-to-end latency.
 */
const STOREFRONT_CASCADE_LIMIT = 5;

/**
 * Builds the priority-ordered storefront list for catalog/search queries that
 * don't carry a storefront in the URL. Apple Music's catalog and search index
 * are per-storefront - a track present in `de` is invisible to a `us` query.
 *
 * Priority:
 * 1. ISRC country code (registrant - strongest signal when present)
 * 2. APPLE_MUSIC_STOREFRONT env override (operator preference)
 * 3. {@link FALLBACK_STOREFRONTS} (large global catalogs)
 *
 * Notes:
 * - An ISRC registrant prefix is only a lookup hint, not proof of regional
 *   availability or a supported Apple storefront. Unavailable storefronts
 *   fall through under StorefrontCascadeOutcome's status rules.
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
    throw new ResolveError(
      "MC-CFG-1001",
      "Apple Music requires APPLE_MUSIC_KEY_ID + APPLE_MUSIC_TEAM_ID + APPLE_MUSIC_PRIVATE_KEY",
    );
  }

  // The private key may be base64-encoded or raw PEM.
  // Decode if it doesn't start with "-----BEGIN".
  // Also replace literal \n sequences (common in .env files) with actual newlines.
  const rawPem = privateKeyPem.startsWith("-----BEGIN")
    ? privateKeyPem
    : Buffer.from(privateKeyPem, "base64").toString("utf-8");
  const pem = rawPem.replace(/\\n/g, "\n");

  let privateKey: Awaited<ReturnType<typeof importPKCS8>>;
  try {
    privateKey = await importPKCS8(pem, "ES256");
  } catch (err) {
    throw new ResolveError("MC-AUTH-1501", `Apple Music private key could not be parsed: ${(err as Error).message}`);
  }

  const now = Math.floor(Date.now() / 1000);
  let token: string;
  try {
    token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt(now)
      .setExpirationTime(now + TOKEN_LIFETIME_SECONDS)
      .sign(privateKey);
  } catch (err) {
    throw new ResolveError("MC-AUTH-1501", `Apple Music JWT signing failed: ${(err as Error).message}`);
  }

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

/**
 * Pre-warm the developer token at startup to avoid first-request latency.
 * The caller checks that the plugin is available, so this never tries to
 * sign a token without keys.
 */
export async function warmAppleMusicToken(): Promise<void> {
  try {
    await assertAppleMusicDeveloperToken();
    console.log("[Apple Music] Developer token pre-warmed");
  } catch (e) {
    console.error("[Apple Music] Token pre-warm failed:", (e as Error).message);
  }
}

/**
 * Verifies that the configured static or signed developer-token profile is
 * usable without making a catalog request. Crawler enablement uses this so a
 * malformed key cannot defer discovery until after network work begins.
 */
export async function assertAppleMusicDeveloperToken(): Promise<void> {
  await getDevToken();
}

/**
 * Authenticated request against the Apple Music API. Not part of the public
 * adapter surface. It is exported for the `apple-music-charts` crawler source
 * (`services/crawler/sources/apple-music-charts.ts`), which reuses the token
 * cache and timeout instead of signing its own developer token.
 */
export async function appleMusicFetch(endpoint: string): Promise<Response> {
  const token = await getDevToken();
  return fetchWithTimeout(
    `${API_BASE}${endpoint}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
    5000,
  );
}

/**
 * Apple Music wrapper around {@link serviceHttpError} that adds the
 * storefront to the error context (Apple Music's regional 404 case is the
 * most common cause of "track not found" and the storefront is the key
 * diagnostic detail).
 */
function appleMusicHttpError(status: number, kind: ResourceKind, id: string, storefront: string): ResolveError {
  const err = serviceHttpError(Service.AppleMusic, status, kind, id);
  if (err.context) (err.context as Record<string, string | number>).storefront = storefront;
  return err;
}

/**
 * Keeps positive evidence without manufacturing a complete negative from a failed cascade.
 * A 404 storefront may be unavailable while another storefront answers; an
 * authentication, quota or server failure still prevents caching a clean miss.
 */
class StorefrontCascadeOutcome {
  private answered = false;
  private lastFailure: { status: number; storefront: string } | null = null;

  /** Records response status and returns whether its document may be decoded. */
  record(response: Response, storefront: string): boolean {
    if (response.ok) {
      this.answered = true;
      return true;
    }
    if (!this.lastFailure || response.status !== 404) {
      this.lastFailure = { status: response.status, storefront };
    }
    return false;
  }

  /**
   * Rejects incomplete negative evidence while retaining a validated positive match.
   * @param kind - Resource being matched.
   * @param id - Public lookup identifier or search title.
   * @param matched - Whether a qualifying resource was found despite another failure.
   * @throws The provider failure when no positive evidence resolves the uncertainty.
   */
  throwIfUnresolved(kind: ResourceKind, id: string, matched = false): void {
    if (!this.lastFailure) return;
    const { status, storefront } = this.lastFailure;
    if (!matched && (!this.answered || status !== 404)) {
      throw appleMusicHttpError(status, kind, id, storefront);
    }
    if (matched && status !== 404) {
      log.deviation(
        {
          component: "Apple Music",
          adapterId: Service.AppleMusic,
          errorCode: "MC-API-0004",
          operation: "storefront_catalog_lookup",
          outcome: "positive_partial_storefronts",
          status,
          storefront,
          kind,
        },
        appleMusicHttpError(status, kind, id, storefront),
      );
    }
  }
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

/**
 * Reads Apple's valid empty result object without accepting a missing search envelope.
 * @param results - Search results, where an absent category means no matching resources.
 * @param category - Requested resource category, whose present data must be an array.
 * @returns Reported resources or an empty list for an omitted category.
 * @throws When the root result object or a present category's collection is malformed.
 */
function searchResources<Resource>(
  results: Record<string, { data?: Resource[] }> | undefined,
  category: "songs" | "albums" | "artists",
): Resource[] {
  const root = requireProviderObject(results, Service.AppleMusic, `${category} search`);
  const resources = root[category];
  return resources === undefined
    ? []
    : requireProviderCollection(resources?.data, Service.AppleMusic, `${category} search`);
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
   * {@link SEARCH_EARLY_EXIT_CONFIDENCE} so the common case stays fast.
   */
  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const text = searchText(query);
    const term = encodeURIComponent(query.album ? `${text} ${query.album}` : text);
    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;
    const cascade = new StorefrontCascadeOutcome();

    for (const storefront of getStorefrontCascade()) {
      const response = await appleMusicFetch(`/catalog/${storefront}/search?types=songs&term=${term}&limit=5`);
      if (!cascade.record(response, storefront)) continue;

      const data = await response.json();
      const songs = searchResources<AppleMusicSongResource>(data.results, "songs");

      for (let index = 0; index < songs.length; index++) {
        const track = mapTrack(songs[index]);
        const confidence = scoreSearchCandidate(query, track, index);

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = track;
        }
      }

      if (bestConfidence >= SEARCH_EARLY_EXIT_CONFIDENCE) break;
    }
    cascade.throwIfUnresolved(
      ResourceKind.Track,
      query.title,
      Boolean(bestMatch && bestConfidence >= MATCH_MIN_CONFIDENCE),
    );

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
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
    const term = encodeURIComponent(`${query.artist} ${query.title}`);
    let bestMatch: NormalizedAlbum | null = null;
    let bestConfidence = 0;
    const cascade = new StorefrontCascadeOutcome();

    for (const storefront of getStorefrontCascade()) {
      const response = await appleMusicFetch(`/catalog/${storefront}/search?types=albums&term=${term}&limit=5`);
      if (!cascade.record(response, storefront)) continue;

      const data = await response.json();
      const albums = searchResources<AppleMusicAlbumResource>(data.results, "albums");

      for (const album of albums) {
        const normalized = mapAlbum(album);
        const confidence = scoreAlbumCandidate(query, normalized);

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = normalized;
        }
      }

      if (bestConfidence >= SEARCH_EARLY_EXIT_CONFIDENCE) break;
    }
    cascade.throwIfUnresolved(
      ResourceKind.Album,
      query.title,
      Boolean(bestMatch && bestConfidence >= MATCH_MIN_CONFIDENCE),
    );

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
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
    const term = encodeURIComponent(query.name);
    let bestMatch: NormalizedArtist | null = null;
    let bestConfidence = 0;
    const cascade = new StorefrontCascadeOutcome();

    for (const storefront of getStorefrontCascade()) {
      const response = await appleMusicFetch(`/catalog/${storefront}/search?types=artists&term=${term}&limit=5`);
      if (!cascade.record(response, storefront)) continue;

      const data = await response.json();
      const artists = searchResources<AppleMusicArtistResource>(data.results, "artists");

      for (const raw of artists) {
        const artist = mapArtist(raw);
        const confidence = calculateArtistNameConfidence(query.name, artist.name);

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = artist;
        }
      }

      if (bestConfidence >= SEARCH_EARLY_EXIT_CONFIDENCE) break;
    }
    cascade.throwIfUnresolved(
      ResourceKind.Artist,
      query.name,
      Boolean(bestMatch && bestConfidence >= MATCH_MIN_CONFIDENCE),
    );

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
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
