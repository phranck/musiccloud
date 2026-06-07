import type {
  ApiGenreAlbumCandidate,
  ApiGenreArtistCandidate,
  ApiGenreTile,
  ApiGenreTrackCandidate,
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

export const ActiveResultKind = {
  Song: "song",
  Album: "album",
  Artist: "artist",
} as const;

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

export type ActiveResult = SongResult | AlbumResult | ArtistResult;

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
  | { type: typeof AppStateType.GenreSearchLoading; payload: GenreSearchPayload; selectedId: string };

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
  | { type: "CLEAR" };
