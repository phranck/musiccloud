/**
 * Wire-format types for the public resolve / share / artist-info APIs.
 *
 * Every type in this file is a direct shape of a JSON payload that crosses
 * the backend-frontend boundary. Changing one of these is a wire-format
 * breaking change: cached share pages rendered against the old shape will
 * stop hydrating. When a field needs to evolve, prefer adding an optional
 * sibling over renaming.
 *
 * `ResolveResponse` is a discriminated union because callers must switch on
 * the shape anyway (success vs disambiguation vs error); encoding the cases
 * at the type level forces every consumer to handle all three.
 *
 * `UnifiedResolveSuccessResponse` additionally discriminates by resource
 * kind (`type: "track" | "album" | "artist"`) so the share route can return
 * one endpoint for all three without the frontend probing fields.
 */

export interface ApiArtistCredit {
  artistEntityId: string;
  name: string;
  role: "main" | "featured" | "remixer" | "producer" | "composer" | "lyricist" | "performer" | "unknown";
  position: number;
}

export interface ApiTrack {
  title: string;
  artists: string[];
  artistCredits?: ApiArtistCredit[];
  albumName?: string;
  artworkUrl?: string;
  durationMs?: number;
  isrc?: string;
  releaseDate?: string;
  isExplicit?: boolean;
  previewUrl?: string;
  /** True when `previewUrl` is absent but the backend can fetch a fresh
   *  Deezer URL on demand via the preview-refresh endpoint. Clients use
   *  this to decide whether to render the audio player in a loading state. */
  previewRefreshable?: boolean;
}

export interface ApiLink {
  service: string;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: "isrc" | "search" | "cache" | "upc" | "isrc-inference";
}

export interface ApiDisambiguationCandidate {
  id: string;
  title: string;
  artists: string[];
  albumName?: string;
  artworkUrl?: string;
}

export interface ResolveSuccessResponse {
  id: string;
  shortUrl: string;
  track: ApiTrack;
  links: ApiLink[];
}

export interface ResolveDisambiguationResponse {
  status: "disambiguation";
  candidates: ApiDisambiguationCandidate[];
}

export interface ResolveErrorResponse {
  /**
   * Canonical error code. During the Phase 2 sweep this is typically an MC
   * code (`MC-URL-0001`, …) but a handful of older call sites still emit
   * legacy codes like `TRACK_NOT_FOUND`. Both forms are resolvable against
   * the registry in `./error-codes` via `getErrorEntry()`.
   */
  error: string;
  /**
   * User-facing message. Ends with the canonical code in parentheses so it
   * can be quoted verbatim in bug reports: e.g. "Track not found.
   * (MC-RES-0001)".
   */
  message: string;
  /**
   * Optional structured values for localized clients. The backend still
   * renders `message` in English for public API callers; first-party UIs
   * should map `error` plus this context to localized copy.
   */
  context?: Record<string, string | number>;
}

export type ResolveResponse =
  | ResolveSuccessResponse
  | ResolveDisambiguationResponse
  | ResolveGenreSearchResponse
  | ResolveGenreBrowseResponse
  | ResolveErrorResponse;

// ─── Genre Search Response ────────────────────────────────────────────────────

/** Track row returned by a genre-search query. */
export interface ApiGenreTrackCandidate {
  id: string;
  title: string;
  artists: string[];
  albumName?: string;
  artworkUrl?: string;
  durationMs?: number;
  /** Deezer URL — click handler feeds this into a follow-up resolve. */
  webUrl: string;
}

/** Album row returned by a genre-search query. */
export interface ApiGenreAlbumCandidate {
  id: string;
  title: string;
  artists: string[];
  artworkUrl?: string;
  webUrl: string;
}

/** Artist row returned by a genre-search query. */
export interface ApiGenreArtistCandidate {
  id: string;
  name: string;
  imageUrl?: string;
  webUrl: string;
}

/**
 * Third resolve response variant, produced when the query starts with
 * `genre:`. Each list in `results` is either a populated array or `null`
 * when the user did not request that type.
 */
export interface ResolveGenreSearchResponse {
  status: "genre-search";
  query: {
    genres: string[];
    vibe: "hot" | "mixed";
    tracks: number | null;
    albums: number | null;
    artists: number | null;
  };
  results: {
    tracks: ApiGenreTrackCandidate[] | null;
    albums: ApiGenreAlbumCandidate[] | null;
    artists: ApiGenreArtistCandidate[] | null;
  };
  /**
   * Non-fatal observations from the query parser — things that were
   * reconciled rather than rejected (e.g. `count` and per-type fields
   * combined with last-wins). The UI should surface these under the
   * result lists so users see what was adjusted. Always present;
   * empty array means the query was clean.
   */
  warnings: string[];
}

// ─── Genre Browse Response ────────────────────────────────────────────────────

/** A single genre tile in the browse grid. */
export interface ApiGenreTile {
  /** Tag name as used in `genre:<name>` queries. */
  name: string;
  /** Capitalised display name for the UI. */
  displayName: string;
  /** Procedurally generated artwork URL — the Astro frontend proxy path `/api/genre-artwork/<name>` with a `?v=<version>` cache-bust query; the proxy forwards to the backend's v1 route, which generates and caches the image on first hit. */
  artworkUrl: string;
  /**
   * Dominant accent hex derived from the genre's top album cover. Present
   * only when the artwork has already been generated; the frontend can use
   * it for hover/border/glow before the JPEG finishes loading.
   */
  accentColor?: string;
}

/**
 * Produced when the query is exactly `genre:?`. Returns a grid of popular
 * genres the user can click to trigger a full genre search.
 */
export interface ResolveGenreBrowseResponse {
  status: "genre-browse";
  genres: ApiGenreTile[];
}

// ─── Unified Resolve Response ─────────────────────────────────────────────────

export type UnifiedResolveSuccessResponse =
  | ({ type: "track" } & ResolveSuccessResponse)
  | ({ type: "album" } & AlbumResolveSuccessResponse)
  | ({ type: "artist" } & ArtistResolveSuccessResponse);

// ─── Creative-Commons (Jamendo) Resolve Types ─────────────────────────────────

/**
 * The `include=musicinfo` classification for a CC track, in the flattened wire /
 * domain shape shared by every layer (Jamendo raw → domain → wire → app → config).
 *
 * Jamendo's raw `musicinfo` is snake_case and nests the three tag families under
 * a `tags` object; this flattens them to the top level and camelCases the scalar
 * classifiers. Every field is best-effort — Jamendo populates them unevenly, so
 * the details card hides any row whose value is empty.
 *
 * @property genres - Genre tags, e.g. `["rock", "indie"]`.
 * @property instruments - Instrument tags, e.g. `["guitar", "piano"]`.
 * @property vartags - Mood / theme tags, surfaced under the UI's "Mood" label.
 * @property vocalInstrumental - `"vocal"` or `"instrumental"`, when known.
 * @property gender - Lead-vocal gender (`"male"` / `"female"`), when known.
 * @property speed - Tempo bucket (`verylow` … `veryhigh`), when known.
 * @property acousticElectric - `"acoustic"` or `"electric"`, when known.
 * @property lang - ISO language of the lyrics, when known.
 */
export interface CcMusicInfo {
  genres: string[];
  instruments: string[];
  vartags: string[];
  vocalInstrumental?: string;
  gender?: string;
  speed?: string;
  acousticElectric?: string;
  lang?: string;
}

/**
 * The `include=stats` engagement counters for a CC track, in wire / domain shape.
 *
 * Jamendo reports these as snake_case totals; the mapper camelCases them and
 * coerces every counter to a number (absent counters default to 0). The details
 * card formats them for display (compact counts, average rating).
 *
 * @property listens - Total play count (Jamendo `rate_listened_total`).
 * @property downloads - Total download count (`rate_downloads_total`).
 * @property playlisted - How many Jamendo playlists include the track.
 * @property favorited - How many users favorited the track.
 * @property likes - Thumbs-up count.
 * @property dislikes - Thumbs-down count.
 * @property avgNote - Average user rating (Jamendo `avgnote`; a fractional score, not a 0–5 star value).
 * @property notes - Number of ratings backing `avgNote`.
 */
export interface CcTrackStats {
  listens: number;
  downloads: number;
  playlisted: number;
  favorited: number;
  likes: number;
  dislikes: number;
  avgNote: number;
  notes: number;
}

/**
 * A Creative-Commons track on the wire. Unlike {@link ApiTrack} it carries no
 * cross-service links; instead it exposes the full permanent stream, the exact
 * CC licence, the optional download, and the waveform peaks the CC player needs.
 */
export interface ApiCcTrack {
  jamendoId: string;
  title: string;
  artistName: string;
  /** Jamendo artist id — drives the client-side CC artist-info fetch. */
  jamendoArtistId: string;
  albumName?: string;
  artworkUrl?: string;
  durationMs?: number;
  releaseDate?: string;
  /** Exact CC licence URL (e.g. `.../licenses/by-nc-nd/3.0/`). */
  licenseCcurl?: string;
  /** Permanent full-track stream URL. */
  streamUrl: string;
  downloadUrl?: string;
  downloadAllowed: boolean;
  /** Escaped JSON string `{"peaks":[…]}` for the waveform scrubber. */
  waveform?: string;
  /** Canonical Jamendo page for the track. */
  shareUrl?: string;
  /** `include=musicinfo` classification (genres, instruments, mood, vocal, …). Absent when Jamendo returns no music info. */
  musicInfo?: CcMusicInfo;
  /** `include=stats` engagement counters (listens, downloads, rating, …). Absent when Jamendo returns no stats. */
  stats?: CcTrackStats;
  /** True when the track is also licensable commercially via Jamendo Pro (`licenses.prolicensing === "true"`). */
  proLicensing?: boolean;
  /** Jamendo Pro licensing page for the track (`prourl`), shown when `proLicensing` is true. */
  proUrl?: string;
}

/**
 * Success payload of the CC resolve route after a candidate was picked.
 * Discriminated by `type: "cc-track"`, mirroring the commercial
 * {@link UnifiedResolveSuccessResponse} shape (`id` + `shortUrl` + entity).
 */
export interface CcResolveSuccessResponse {
  type: "cc-track";
  id: string;
  shortUrl: string;
  track: ApiCcTrack;
  /**
   * Right-column data for the shared share layout, built from Jamendo: the
   * track artist's popular tracks (`topTracks`) plus similar tracks
   * (`similarArtistTracks`). `profile` is null and `events` empty — Jamendo has
   * neither — so those cards self-hide. Lets a CC result reuse the commercial
   * artist column verbatim. Optional: the CC live view loads this client-side
   * (async, via `/api/cc/artist-info`), so the resolve response omits it.
   */
  artistInfo?: ArtistInfoResponse;
}

/**
 * A Creative-Commons album on the wire, with its full track list inlined.
 * Mirrors {@link ApiCcTrack}: no cross-service links, just the Jamendo entity
 * plus the permanent CC tracks the album view renders.
 */
export interface ApiCcAlbum {
  jamendoId: string;
  name: string;
  artistName: string;
  artworkUrl?: string;
  releaseDate?: string;
  /** Jamendo album-zip download URL, when the album allows a full download. */
  zipUrl?: string;
  /** Canonical Jamendo page for the album. */
  shareUrl?: string;
  /** The album's tracks in release order; each is independently playable. */
  tracks: ApiCcTrack[];
}

/**
 * Success payload of the CC resolve route after a `jamendo-album:` candidate was
 * picked. Discriminated by `type: "cc-album"`, mirroring
 * {@link CcResolveSuccessResponse} (`id` + `shortUrl` + entity).
 */
export interface CcAlbumResolveSuccessResponse {
  type: "cc-album";
  id: string;
  shortUrl: string;
  album: ApiCcAlbum;
  /** Right-column data: the album's tracks as `topTracks` plus similar tracks. See {@link CcResolveSuccessResponse.artistInfo}. */
  artistInfo: ArtistInfoResponse;
}

/**
 * A Creative-Commons artist on the wire, with its most-popular tracks inlined.
 */
export interface ApiCcArtist {
  jamendoId: string;
  name: string;
  /** Artist's own website, when Jamendo has one. */
  website?: string;
  imageUrl?: string;
  /** Canonical Jamendo page for the artist. */
  shareUrl?: string;
  /** The artist's most-popular CC tracks, descending; each independently playable. */
  topTracks: ApiCcTrack[];
}

/**
 * Success payload of the CC resolve route after a `jamendo-artist:` candidate was
 * picked. Discriminated by `type: "cc-artist"`.
 */
export interface CcArtistResolveSuccessResponse {
  type: "cc-artist";
  id: string;
  shortUrl: string;
  artist: ApiCcArtist;
  /** Right-column data: the artist's top tracks as `topTracks` plus similar tracks. See {@link CcResolveSuccessResponse.artistInfo}. */
  artistInfo: ArtistInfoResponse;
}

// ─── Album API Types ──────────────────────────────────────────────────────────

export interface ApiAlbum {
  title: string;
  artists: string[];
  artistCredits?: ApiArtistCredit[];
  releaseDate?: string;
  totalTracks?: number;
  artworkUrl?: string;
  label?: string;
  upc?: string;
  previewUrl?: string;
}

export interface AlbumResolveSuccessResponse {
  id: string;
  shortUrl: string;
  album: ApiAlbum;
  links: ApiLink[];
}

// ─── Artist Resolve API Types ────────────────────────────────────────────────

export interface ApiArtist {
  name: string;
  imageUrl?: string;
  genres?: string[];
}

export interface ArtistResolveSuccessResponse {
  id: string;
  shortUrl: string;
  artist: ApiArtist;
  links: ApiLink[];
}

// ─── Share Page Response ──────────────────────────────────────────────────────

/** OG meta tags returned by the backend share endpoint */
export interface OgMeta {
  title: string;
  description: string;
  image?: string;
  url: string;
}

/**
 * The commercial (cross-service) share-page payload: a resolved track, album or
 * artist with its per-service links. Exactly one of `track`/`album`/`artist` is
 * present, selected by the `type` discriminant.
 */
export interface CommercialSharePageResponse {
  type: "track" | "album" | "artist";
  og: OgMeta;
  track?: ApiTrack;
  album?: ApiAlbum;
  artist?: ApiArtist;
  links: ApiLink[];
  shortUrl: string;
}

/**
 * The Creative-Commons (Jamendo) share-page payload for a CC track. Carries the
 * full CC entity ({@link ApiCcTrack}) plus the right-column
 * {@link ArtistInfoResponse} instead of cross-service links, mirroring
 * {@link CcResolveSuccessResponse} so the persistent share page and the live
 * resolve render through the exact same `ShareLayout`.
 */
export interface CcTrackSharePageResponse {
  type: "cc-track";
  og: OgMeta;
  shortUrl: string;
  track: ApiCcTrack;
  /** Optional: loaded client-side (async) via `/api/cc/artist-info` so the share
   *  page renders the core card immediately. */
  artistInfo?: ArtistInfoResponse;
}

/** The Creative-Commons share-page payload for a CC album. See {@link CcTrackSharePageResponse}. */
export interface CcAlbumSharePageResponse {
  type: "cc-album";
  og: OgMeta;
  shortUrl: string;
  album: ApiCcAlbum;
  artistInfo: ArtistInfoResponse;
}

/** The Creative-Commons share-page payload for a CC artist. See {@link CcTrackSharePageResponse}. */
export interface CcArtistSharePageResponse {
  type: "cc-artist";
  og: OgMeta;
  shortUrl: string;
  artist: ApiCcArtist;
  artistInfo: ArtistInfoResponse;
}

/**
 * Unified share-page payload returned by `GET /api/v1/share/:shortId`,
 * discriminated by `type`. Commercial entities carry cross-service `links`; CC
 * entities carry the Jamendo entity plus the right-column `artistInfo`.
 */
export type SharePageResponse =
  | CommercialSharePageResponse
  | CcTrackSharePageResponse
  | CcAlbumSharePageResponse
  | CcArtistSharePageResponse;

// ─── Artist Info Response ──────────────────────────────────────────────────────

export interface ArtistTopTrack {
  title: string;
  artists: string[];
  albumName: string | null;
  artworkUrl: string | null;
  durationMs: number | null;
  deezerUrl: string;
  shortId: string | null;
}

export interface ArtistProfile {
  imageUrl: string | null;
  genres: string[]; // max 3
  // Spotify removed `artist.popularity` and `artist.followers` in Feb 2026.
  // popularity reflects Last.fm `stats.listeners` (non-negative integer,
  // not the old 0–100 scale). followers reflects Deezer `nb_fan` (with
  // Last.fm listeners as a fallback surrogate). Both null when no source
  // returned a value.
  popularity: number | null;
  followers: number | null;
  // Last.fm enrichment (null if LASTFM_API_KEY not set)
  bioSummary: string | null;
  scrobbles: number | null;
  similarArtists: string[]; // max 3 artist names
}

export interface ArtistEvent {
  date: string; // "YYYY-MM-DD"
  venueName: string;
  city: string;
  country: string; // ISO country code
  ticketUrl: string | null;
  source: "bandsintown" | "ticketmaster";
}

export interface SimilarArtistTrack {
  artistName: string;
  track: ArtistTopTrack | null;
}

export interface ArtistInfoResponse {
  artistName: string;
  topTracks: ArtistTopTrack[]; // empty if Deezer unavailable
  profile: ArtistProfile | null; // null if no source returned data
  events: ArtistEvent[]; // empty if no keys or no upcoming events
  similarArtistTracks?: SimilarArtistTrack[]; // top track per similar artist
}
