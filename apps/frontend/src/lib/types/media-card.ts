import type { PlatformLink } from "./platform";

export type { PlatformLink };

// ---------------------------------------------------------------------------
// Content configuration protocol
// ---------------------------------------------------------------------------

export type MediaCardContentType = "song" | "album" | "share";

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
  /** Optional: preview audio URL for mini-player (tracks only) */
  previewUrl?: string;
  platforms: PlatformLink[];
  /** Pre-translated label above the platform grid */
  platformsLabel: string;
  /** Optional pre-translated availability note below the platform grid */
  platformsInfo?: string;
}

/**
 * Track result on the landing page.
 * Shows ShareButton and sr-announcement.
 */
export interface SongContentConfiguration extends MediaCardContentConfiguration {
  type: "song";
  shareUrl: string;
  srAnnouncement?: string;
  onAlbumArtLoad?: (img: HTMLImageElement) => void;
}

/**
 * Album result on the landing page.
 * Shows ShareButton and sr-announcement.
 */
export interface AlbumContentConfiguration extends MediaCardContentConfiguration {
  type: "album";
  shareUrl: string;
  srAnnouncement?: string;
  onAlbumArtLoad?: (img: HTMLImageElement) => void;
}

/**
 * Share page (`/[shortId]`).
 * No ShareButton, no sr-announcement, no onAlbumArtLoad callback.
 * All fields are plain data so the config is fully JSON-serializable.
 *
 * `platformsLabelKey` is the i18n key for the platforms label so the
 * client-side LocaleProvider can re-translate it after a locale change.
 * `platformsLabel` (from base) serves as SSR-rendered fallback to avoid flash.
 */
export interface ShareContentConfiguration extends MediaCardContentConfiguration {
  type: "share";
  platformsLabelKey: string;
}

/** Type guard: true for song and album configs (both have shareUrl / srAnnouncement) */
export function isShareableContent(
  content: MediaCardContentConfiguration,
): content is SongContentConfiguration | AlbumContentConfiguration {
  return content.type === "song" || content.type === "album";
}
