export type ServiceId = "spotify" | "apple-music" | "youtube" | "soundcloud" | "tidal" | "deezer";

/** ServiceId plus "cached" for tracks loaded from the database cache */
export type TrackSource = ServiceId | "cached";

const VALID_SERVICE_IDS: readonly ServiceId[] = ["spotify", "apple-music", "youtube", "soundcloud", "tidal", "deezer"];

export function isValidServiceId(value: unknown): value is ServiceId {
  return typeof value === "string" && VALID_SERVICE_IDS.includes(value as ServiceId);
}

export interface NormalizedTrack {
  isrc?: string;
  sourceService: TrackSource;
  sourceId: string;
  title: string;
  artists: string[];
  albumName?: string;
  durationMs?: number;
  releaseDate?: string;
  isExplicit?: boolean;
  artworkUrl?: string;
  previewUrl?: string;
  webUrl: string;
}

export interface MatchResult {
  found: boolean;
  track?: NormalizedTrack;
  confidence: number;
  matchMethod: MatchMethod;
}

export interface SearchResultWithCandidates {
  bestMatch: MatchResult;
  candidates: Array<{
    track: NormalizedTrack;
    confidence: number;
  }>;
}

export type MatchMethod = "isrc" | "search" | "odesli" | "cache";

export interface AdapterCapabilities {
  supportsIsrc: boolean;
  supportsPreview: boolean;
  supportsArtwork: boolean;
}

export interface ServiceAdapter {
  readonly id: ServiceId;
  readonly displayName: string;
  readonly capabilities: AdapterCapabilities;

  isAvailable(): boolean;
  detectUrl(url: string): string | null;
  getTrack(trackId: string): Promise<NormalizedTrack>;
  findByIsrc(isrc: string): Promise<NormalizedTrack | null>;
  searchTrack(query: SearchQuery): Promise<MatchResult>;
  searchTrackWithCandidates?(query: SearchQuery): Promise<SearchResultWithCandidates>;
}

export interface SearchQuery {
  title: string;
  artist: string;
  album?: string;
}

export interface ResolveResponse {
  id: string;
  shortUrl: string;
  track: {
    title: string;
    artists: string[];
    albumName?: string;
    artworkUrl?: string;
  };
  links: ServiceLink[];
}

export interface ServiceLink {
  service: ServiceId;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: MatchMethod;
}

export interface SearchCandidate {
  id: string;
  title: string;
  artists: string[];
  albumName?: string;
  artworkUrl?: string;
  durationMs?: number;
  confidence: number;
}

export interface DisambiguationResponse {
  status: "disambiguation";
  candidates: SearchCandidate[];
}
