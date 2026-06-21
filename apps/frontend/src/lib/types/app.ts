import type {
  ApiGenreAlbumCandidate,
  ApiGenreArtistCandidate,
  ApiGenreTile,
  ApiGenreTrackCandidate,
  ArtistInfoResponse,
  UnifiedResolveSuccessResponse,
} from "@musiccloud/shared";
import type { DisambiguationCandidate } from "./disambiguation";
import type { PlatformLink } from "./platform";

/**
 * Results of a genre-search query, held on the app state while the
 * landing page renders the three-column discovery view.
 */
export interface GenreSearchResults {
  tracks: ApiGenreTrackCandidate[] | null;
  albums: ApiGenreAlbumCandidate[] | null;
  artists: ApiGenreArtistCandidate[] | null;
}

/**
 * Full genre-search response payload as held on the app state: the
 * original query string (so it can be restored in the hero input on
 * back-navigation), the parsed query details (so the header can render
 * a natural-language summary of what's on screen), the three result
 * lists, and any non-fatal parser observations.
 */
export interface GenreSearchPayload {
  /** Exact query string the user submitted — used to repopulate the hero input on back-navigation. */
  query: string;
  /** Parsed view of the query, used to build the natural-language headline. */
  queryDetails: {
    genres: string[];
    vibe: "hot" | "mixed";
    tracks: number | null;
    albums: number | null;
    artists: number | null;
  };
  results: GenreSearchResults;
  warnings: string[];
}

export interface ResolveUiError {
  key: string;
  code?: string;
  context?: Record<string, string>;
}

export const InputState = {
  Idle: "idle",
  Focused: "focused",
  Loading: "loading",
  Success: "success",
  Error: "error",
} as const;

export type InputState = (typeof InputState)[keyof typeof InputState];

/**
 * The two resolve modes the user can choose between.
 *
 * - `Commercial` routes queries through the standard commercial resolve endpoint
 *   (`/api/resolve`) and surfaces streaming-platform links.
 * - `Cc` routes queries through the Creative Commons resolve endpoint
 *   (`/api/cc/resolve`) and surfaces Jamendo tracks with license/attribution
 *   metadata instead of platform links.
 *
 * Values are intentionally lower-case strings to match the `data-resolve-mode`
 * HTML attribute and the persisted `mc:resolveMode` localStorage key verbatim,
 * eliminating any mapping layer.
 */
export const ResolveMode = {
  Commercial: "commercial",
  Cc: "cc",
} as const;

export type ResolveMode = (typeof ResolveMode)[keyof typeof ResolveMode];

export const ActiveResultKind = {
  Song: "song",
  Album: "album",
  Artist: "artist",
  CcSong: "cc-song",
  CcAlbum: "cc-album",
  CcArtist: "cc-artist",
} as const;

/**
 * Discriminant namespace for CC resolve responses.
 *
 * Members match the `type` field emitted by the CC resolve endpoint
 * (`"cc-track"` / `"cc-album"` / `"cc-artist"`). Using this namespace instead of
 * inline string literals keeps the domain-literals Doctor rule green and ensures
 * all comparisons point to a single source of truth.
 */
export const CcResultType = {
  CcTrack: "cc-track",
  CcAlbum: "cc-album",
  CcArtist: "cc-artist",
} as const;

export type CcResultType = (typeof CcResultType)[keyof typeof CcResultType];

export const AppStateType = {
  Idle: "idle",
  Loading: "loading",
  Result: "result",
  Clearing: "clearing",
  Error: "error",
  Disambiguation: "disambiguation",
  DisambiguationLoading: "disambiguation_loading",
  GenreBrowse: "genre-browse",
  GenreSearch: "genre-search",
  GenreSearchLoading: "genre-search_loading",
  CcResult: "cc-result",
} as const;

export interface SongResult {
  kind: typeof ActiveResultKind.Song;
  title: string;
  artist: string;
  album?: string;
  releaseDate?: string;
  durationMs?: number;
  isrc?: string;
  isExplicit?: boolean;
  artworkUrl: string;
  previewUrl?: string;
  platforms: PlatformLink[];
  shareUrl: string;
}

export interface AlbumResult {
  kind: typeof ActiveResultKind.Album;
  title: string;
  artist: string;
  releaseDate?: string;
  totalTracks?: number;
  label?: string;
  upc?: string;
  artworkUrl: string;
  previewUrl?: string;
  platforms: PlatformLink[];
  shareUrl: string;
}

export interface ArtistResult {
  kind: typeof ActiveResultKind.Artist;
  name: string;
  imageUrl: string;
  genres?: string[];
  platforms: PlatformLink[];
  shareUrl: string;
}

/**
 * A resolved Creative Commons track from the Jamendo catalogue.
 *
 * Intentionally has no `platforms` field — CC tracks are accessed directly
 * via Jamendo (stream, download, artist page) rather than through a
 * multi-platform link grid. The `shareUrl` is the musiccloud short URL for
 * this result; `jamendoUrl` is the canonical Jamendo page for the track.
 *
 * All optional fields may be absent when Jamendo's API does not return them
 * for a given track.
 */
export interface CcTrackResult {
  /** Discriminant: always `ActiveResultKind.CcSong`. */
  kind: typeof ActiveResultKind.CcSong;
  /** Jamendo numeric track ID (as string). */
  jamendoId: string;
  /** Track title as returned by Jamendo. */
  title: string;
  /** Primary artist name. */
  artist: string;
  /** Album title, if available. */
  album?: string;
  /** ISO 8601 release date string (`YYYY-MM-DD`), if available. */
  releaseDate?: string;
  /** Track duration in milliseconds, if available. */
  durationMs?: number;
  /** URL of the track's cover art (always present — falls back to a placeholder). */
  artworkUrl: string;
  /** Direct MP3 stream URL for the full track (Jamendo's `audio` field). */
  streamUrl: string;
  /** Canonical URL of the CC licence deed (e.g. `https://creativecommons.org/licenses/by/4.0/`), if available. */
  licenseCcurl?: string;
  /** Direct download URL for the track MP3, if `downloadAllowed` is true. */
  downloadUrl?: string;
  /** Whether Jamendo permits direct download of this track. */
  downloadAllowed: boolean;
  /** URL of the waveform image provided by Jamendo, if available. */
  waveform?: string;
  /** Canonical Jamendo page for the track, used for the "Open on Jamendo" link. */
  jamendoUrl?: string;
  /** musiccloud short URL for this result (e.g. `https://musi.cc/abc123`). */
  shareUrl: string;
  /** Right-column data (track-artist popular tracks + similar tracks) for the shared artist column. */
  artistInfo: ArtistInfoResponse;
}

/**
 * A resolved Creative Commons album from Jamendo: the album header plus its
 * artist-column data. `shareUrl` is the musiccloud short URL; `jamendoUrl` is
 * the canonical Jamendo album page.
 */
export interface CcAlbumResult {
  kind: typeof ActiveResultKind.CcAlbum;
  jamendoId: string;
  title: string;
  artist: string;
  releaseDate?: string;
  artworkUrl: string;
  jamendoUrl?: string;
  shareUrl: string;
  /** Right-column data (the album's tracks + similar tracks) for the shared artist column. */
  artistInfo: ArtistInfoResponse;
}

/**
 * A resolved Creative Commons artist from Jamendo: the artist header plus its
 * artist-column data. `shareUrl` is the musiccloud short URL; `jamendoUrl` is
 * the canonical Jamendo artist page.
 */
export interface CcArtistResult {
  kind: typeof ActiveResultKind.CcArtist;
  jamendoId: string;
  name: string;
  imageUrl: string;
  jamendoUrl?: string;
  shareUrl: string;
  /** Right-column data (the artist's top tracks + similar tracks) for the shared artist column. */
  artistInfo: ArtistInfoResponse;
}

/**
 * Any resolved Creative Commons entity held on the CC result state (`ccActive`).
 * Kept separate from {@link ActiveResult}: CC entities never flow through the
 * commercial `active` path or its platform-link config builders.
 */
export type CcResult = CcTrackResult | CcAlbumResult | CcArtistResult;

export type ActiveResult = SongResult | AlbumResult | ArtistResult | CcTrackResult;

export type AppState =
  | { type: typeof AppStateType.Idle }
  | { type: typeof AppStateType.Loading; compact: boolean }
  | { type: typeof AppStateType.Result; active: ActiveResult; resolved?: UnifiedResolveSuccessResponse }
  | { type: typeof AppStateType.Clearing; active: ActiveResult; resolved?: UnifiedResolveSuccessResponse }
  | { type: typeof AppStateType.Error; error: ResolveUiError }
  | { type: typeof AppStateType.Disambiguation; candidates: DisambiguationCandidate[] }
  | { type: typeof AppStateType.DisambiguationLoading; candidates: DisambiguationCandidate[]; selectedId: string }
  | { type: typeof AppStateType.GenreBrowse; genres: ApiGenreTile[] }
  | { type: typeof AppStateType.GenreSearch; payload: GenreSearchPayload }
  | { type: typeof AppStateType.GenreSearchLoading; payload: GenreSearchPayload; selectedId: string }
  | { type: typeof AppStateType.CcResult; ccActive: CcResult };

export interface ReducerState {
  screen: AppState;
  stack: AppState[];
}

export type AppAction =
  | { type: "SUBMIT" }
  | { type: "RESOLVE_SUCCESS"; active: ActiveResult; resolved?: UnifiedResolveSuccessResponse }
  | { type: "DISAMBIGUATION"; candidates: DisambiguationCandidate[] }
  | { type: "SELECT_CANDIDATE"; selectedId: string }
  | { type: "GENRE_BROWSE"; genres: ApiGenreTile[] }
  | { type: "GENRE_SEARCH"; payload: GenreSearchPayload }
  | { type: "SELECT_GENRE_RESULT"; selectedId: string }
  | { type: "NAV_BACK" }
  | { type: "ERROR"; error: ResolveUiError }
  | { type: "CLEAR_START" }
  | { type: "CLEAR" }
  | { type: "RESOLVE_CC_SUCCESS"; ccActive: CcResult };
