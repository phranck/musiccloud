/**
 * Repository contract for share pages and short urls: loading a track, album
 * or artist share page by its short id, finding the short ids stored for
 * source track urls, and picking a random short id for the landing page.
 * `postgres-tracks.ts`, `postgres-albums.ts`, `postgres-artists.ts` and
 * `postgres-admin-catalog.ts` implement it behind the `PostgresAdapter` facade.
 */

import type { VinylLayout } from "@musiccloud/shared";
import type { ArtistCredit } from "../../services/types.js";

/** Minimal share-page data returned by the repository (before OG meta generation) */
export interface SharePageDbResult {
  trackId: string;
  track: {
    title: string;
    albumName: string | null;
    artworkUrl: string | null;
    durationMs: number | null;
    isrc: string | null;
    releaseDate: string | null;
    isExplicit: boolean | null;
    previewUrl: string | null;
  };
  artists: string[];
  artistCredits: ArtistCredit[];
  artistDisplay: string;
  shortId: string;
  links: Array<{ service: string; url: string }>;
}

/** Minimal share-page data for albums */
export interface SharePageAlbumResult {
  /** The stored album's id, which its preview rows are keyed by. */
  albumId: string;
  album: {
    title: string;
    artworkUrl: string | null;
    releaseDate: string | null;
    totalTracks: number | null;
    label: string | null;
    upc: string | null;
    previewUrl: string | null;
    vinylLayout: VinylLayout | null;
  };
  artists: string[];
  artistCredits: ArtistCredit[];
  artistDisplay: string;
  shortId: string;
  links: Array<{ service: string; url: string }>;
}

/** Minimal share-page data for artists */
export interface SharePageArtistResult {
  artist: {
    name: string;
    imageUrl: string | null;
    genres: string[];
  };
  shortId: string;
  links: Array<{ service: string; url: string }>;
}

/**
 * Loads share pages and resolves short urls. `TrackRepository` extends it, so
 * every caller of the full repository keeps these methods.
 */
export interface SharePageRepository {
  /**
   * Finds short ID by track URL.
   *
   * @param url - The `url` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findShortIdByTrackUrl(url: string): Promise<string | null>;
  /**
   * Finds short IDs for a set of source track URLs in one query.
   *
   * @param urls - Source URLs recorded against tracks.
   * @returns A map containing only URLs with an assigned short ID.
   */
  findShortIdsByTrackUrls(urls: string[]): Promise<Map<string, string>>;

  // Track: Share page queries
  /**
   * Loads by short ID.
   *
   * @param shortId - The `shortId` value.
   * @returns The matching record, or `null` when no row matches.
   */
  loadByShortId(shortId: string): Promise<SharePageDbResult | null>;
  /**
   * Loads by track ID.
   *
   * @param trackId - The `trackId` value.
   * @returns The matching record, or `null` when no row matches.
   */
  loadByTrackId(trackId: string): Promise<SharePageDbResult | null>;

  // Album: Share page queries
  /**
   * Loads album by short ID.
   *
   * @param shortId - The `shortId` value.
   * @returns The matching record, or `null` when no row matches.
   */
  loadAlbumByShortId(shortId: string): Promise<SharePageAlbumResult | null>;

  // Artist: Share page queries
  /**
   * Loads artist by short ID.
   *
   * @param shortId - The `shortId` value.
   * @returns The matching record, or `null` when no row matches.
   */
  loadArtistByShortId(shortId: string): Promise<SharePageArtistResult | null>;

  // Example: random short ID for landing page teaser
  /**
   * Gets random short ID.
   *
   * @returns The matching record, or `null` when no row matches.
   */
  getRandomShortId(): Promise<string | null>;
}
