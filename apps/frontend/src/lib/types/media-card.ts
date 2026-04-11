import type { PlatformLink } from "./platform";

export type { PlatformLink };

// ---------------------------------------------------------------------------
// Content configuration protocol
// ---------------------------------------------------------------------------

export type MediaCardContentType = "song" | "album" | "artist" | "share";

/**
 * Base configuration shared by all three content types.
 * All translatable strings must be pre-computed by the caller.
 */
export interface MediaCardContentConfiguration {
  type: MediaCardContentType;
  title: string;
  artist: string;
  artworkUrl: string;
  /** Optional: album name shown as third line below artist (song-only) */
  album?: string;
  /** Optional: renders the "E" explicit badge in the meta line (song-only) */
  isExplicit?: boolean;
  /** Pre-computed meta line (e.g. "3:45 · USRC1234" or "12 Tracks · 2024") */
  metaLine?: string;
  /** 30-second audio preview URL (Deezer or Spotify). Optional: mini-player shown only when set. */
  previewUrl?: string;
  platforms: PlatformLink[];
  /** Pre-translated label above the platform grid */
  platformsLabel: string;
  /** Optional pre-translated availability note below the platform grid */
  platformsInfo?: string;
  /**
   * Called when the album art image finishes loading — used to extract
   * dynamic accent colors. Not serializable; must be provided client-side.
   */
  onAlbumArtLoad?: (img: HTMLImageElement) => void;
}

/**
 * Track result on the landing page.
 * Shows ShareButton and sr-announcement.
 */
export interface SongContentConfiguration extends MediaCardContentConfiguration {
  type: "song";
  shareUrl: string;
  srAnnouncement?: string;
}

/**
 * Album result on the landing page.
 * Shows ShareButton and sr-announcement.
 */
export interface AlbumContentConfiguration extends MediaCardContentConfiguration {
  type: "album";
  shareUrl: string;
  srAnnouncement?: string;
}

/**
 * Artist result on the landing page.
 * Shows ShareButton and sr-announcement.
 */
export interface ArtistContentConfiguration extends MediaCardContentConfiguration {
  type: "artist";
  shareUrl: string;
  srAnnouncement?: string;
}

/**
 * Share page (`/[shortId]`).
 * No ShareButton, no sr-announcement.
 * Plain data fields are fully JSON-serializable (from Astro SSR).
 * `onAlbumArtLoad` (inherited from base) is injected client-side by ShareLayoutInner.
 *
 * `platformsLabelKey` is the i18n key for the platforms label so the
 * client-side LocaleProvider can re-translate it after a locale change.
 * `platformsLabel` (from base) serves as SSR-rendered fallback to avoid flash.
 */
export interface ShareContentConfiguration extends MediaCardContentConfiguration {
  type: "share";
  platformsLabelKey: string;
  /** The short URL for this share (used for embed code generation) */
  shortUrl: string;
}

/** Type guard: true for song, album, and artist configs (all have shareUrl / srAnnouncement) */
export function isShareableContent(
  content: MediaCardContentConfiguration,
): content is SongContentConfiguration | AlbumContentConfiguration | ArtistContentConfiguration {
  return content.type === "song" || content.type === "album" || content.type === "artist";
}

/** Type guard: true for share page config (has shortUrl for embed) */
export function isSharePageContent(
  content: MediaCardContentConfiguration,
): content is ShareContentConfiguration {
  return content.type === "share";
}
