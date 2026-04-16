import type { ApiGenreAlbumCandidate, ApiGenreArtistCandidate, ApiGenreTrackCandidate } from "@musiccloud/shared";
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

export type InputState = "idle" | "focused" | "loading" | "success" | "error";

export interface SongResult {
  kind: "song";
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
  kind: "album";
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
  kind: "artist";
  name: string;
  imageUrl: string;
  genres?: string[];
  platforms: PlatformLink[];
  shareUrl: string;
}

export type ActiveResult = SongResult | AlbumResult | ArtistResult;

export type AppState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "result"; active: ActiveResult; returnTo?: GenreSearchPayload }
  | { type: "clearing"; active: ActiveResult }
  | { type: "error"; message: string }
  | { type: "disambiguation"; candidates: DisambiguationCandidate[] }
  | { type: "disambiguation_loading"; candidates: DisambiguationCandidate[]; selectedId: string }
  | { type: "genre-search"; payload: GenreSearchPayload }
  | { type: "genre-search_loading"; payload: GenreSearchPayload; selectedId: string };

export type AppAction =
  | { type: "SUBMIT" }
  | { type: "RESOLVE_SUCCESS"; active: ActiveResult }
  | { type: "DISAMBIGUATION"; candidates: DisambiguationCandidate[] }
  | { type: "SELECT_CANDIDATE"; selectedId: string }
  | { type: "GENRE_SEARCH"; payload: GenreSearchPayload }
  | { type: "SELECT_GENRE_RESULT"; selectedId: string }
  | { type: "BACK_TO_GENRE_SEARCH" }
  | { type: "ERROR"; message: string }
  | { type: "CLEAR_START" }
  | { type: "CLEAR" };
