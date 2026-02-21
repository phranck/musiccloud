import type { DisambiguationCandidate } from "./disambiguation";
import type { PlatformLink } from "./platform";

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

export type ActiveResult = SongResult | AlbumResult;

export type AppState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "result"; active: ActiveResult }
  | { type: "clearing"; active: ActiveResult }
  | { type: "error"; message: string }
  | { type: "disambiguation"; candidates: DisambiguationCandidate[] }
  | { type: "disambiguation_loading"; candidates: DisambiguationCandidate[]; selectedId: string };

export type AppAction =
  | { type: "SUBMIT" }
  | { type: "RESOLVE_SUCCESS"; active: ActiveResult }
  | { type: "DISAMBIGUATION"; candidates: DisambiguationCandidate[] }
  | { type: "SELECT_CANDIDATE"; selectedId: string }
  | { type: "ERROR"; message: string }
  | { type: "CLEAR_START" }
  | { type: "CLEAR" };
