/**
 * Shared API response types used by both the API route and frontend components.
 *
 * These types define the contract between /api/resolve and the LandingPage component.
 * If the API response shape changes, update these types and both sides will get
 * compile-time errors if they're out of sync.
 */
import type { ErrorCode } from "./errors.js";

export interface ApiTrack {
  title: string;
  artists: string[];
  albumName?: string;
  artworkUrl?: string;
  durationMs?: number;
  isrc?: string;
  releaseDate?: string;
  isExplicit?: boolean;
}

export interface ApiLink {
  service: string;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: "isrc" | "search" | "odesli" | "cache";
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
  error: ErrorCode;
  message: string;
}

export type ResolveResponse =
  | ResolveSuccessResponse
  | ResolveDisambiguationResponse
  | ResolveErrorResponse;
