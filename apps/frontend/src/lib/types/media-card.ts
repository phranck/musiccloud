import type { CcMusicInfo, CcTrackStats, VinylLayout } from "@musiccloud/shared";
import type { PlatformLink } from "./platform";

export type { PlatformLink };

// ---------------------------------------------------------------------------
// Content configuration protocol
// ---------------------------------------------------------------------------

export const MediaCardContentTypeValue = {
  Song: "song",
  Album: "album",
  Artist: "artist",
  Share: "share",
  CcTrack: "cc-track",
} as const;

export type MediaCardContentType = (typeof MediaCardContentTypeValue)[keyof typeof MediaCardContentTypeValue];

/**
 * Whether the player plays a short preview clip or a full track. Drives the
 * player's wording ("preview" vs "song"); CC / Jamendo tracks are full songs.
 */
export const MediaKindValue = {
  Preview: "preview",
  Song: "song",
} as const;

export type MediaKindType = (typeof MediaKindValue)[keyof typeof MediaKindValue];

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
  /** LP paper-label album/title field. Kept structured so views never parse `metaLine`. */
  labelAlbumTitle?: string;
  /** LP paper-label year field, normally `YYYY`. Kept structured so views never parse `metaLine`. */
  labelReleaseYear?: string;
  /** LP paper-label catalog/imprint field such as ISRC, UPC, label or license text. */
  labelCatalogText?: string;
  /** LP paper-label rights field (top-left). Commercial defaults to "GEMA"; the
   *  Creative-Commons path sets the CC licence label, where "GEMA" is meaningless. */
  labelRightsText?: string;
  /** Discogs-derived vinyl timing data for the displayed record, when available. */
  vinylLayout?: VinylLayout;
  /** 30-second audio preview URL (Deezer or Spotify). Optional: mini-player shown only when set. */
  previewUrl?: string;
  /** True when `previewUrl` is absent but the backend can fetch a fresh URL
   *  on demand. The audio player renders a loading state and calls
   *  `/api/share-preview/:shortId` to retrieve it. */
  previewRefreshable?: boolean;
  /** Short ID of the share — used by the audio player to call the
   *  preview-refresh endpoint when `previewRefreshable` is set. */
  shortId?: string;
  /** Whether `previewUrl` is a short preview clip (default) or a full track
   *  (CC / Jamendo). Drives the player's wording. Defaults to a preview. */
  mediaKind?: MediaKindType;
  /** CC only: the track's Jamendo artist id, so ShareLayout loads the CC artist
   *  column async via `/api/cc/artist-info` instead of receiving it pre-built. */
  ccJamendoArtistId?: string;
  /** CC track only: the license / attribution content for the secondary card.
   *  When set, the result's secondary slot renders a `CcInfoCard` instead of the
   *  commercial `ServicesCard` — so an in-place CC resolve swaps it automatically. */
  ccInfoContent?: CcTrackContentConfiguration;
  platforms: PlatformLink[];
  /** Pre-translated label above the platform grid */
  platformsLabel: string;
  /** Optional pre-translated availability note below the platform grid */
  platformsInfo?: string;
  /** Optional one-line status for the fourth VFD row. Pre-translated by caller. */
  statusLine?: string;
}

/**
 * Track result on the landing page.
 * Shows ShareButton and sr-announcement.
 */
export interface SongContentConfiguration extends MediaCardContentConfiguration {
  type: typeof MediaCardContentTypeValue.Song;
  shareUrl: string;
  srAnnouncement?: string;
}

/**
 * Album result on the landing page.
 * Shows ShareButton and sr-announcement.
 */
export interface AlbumContentConfiguration extends MediaCardContentConfiguration {
  type: typeof MediaCardContentTypeValue.Album;
  shareUrl: string;
  srAnnouncement?: string;
}

/**
 * Artist result on the landing page.
 * Shows ShareButton and sr-announcement.
 */
export interface ArtistContentConfiguration extends MediaCardContentConfiguration {
  type: typeof MediaCardContentTypeValue.Artist;
  shareUrl: string;
  srAnnouncement?: string;
}

/**
 * Share page (`/[shortId]`).
 * No ShareButton, no sr-announcement.
 * Plain data fields are fully JSON-serializable (from Astro SSR).
 * `platformsLabelKey` is the i18n key for the platforms label so the
 * client-side LocaleProvider can re-translate it after a locale change.
 * `platformsLabel` (from base) serves as SSR-rendered fallback to avoid flash.
 */
export interface ShareContentConfiguration extends MediaCardContentConfiguration {
  type: typeof MediaCardContentTypeValue.Share;
  platformsLabelKey: string;
  /** The short URL for this share page. */
  shortUrl: string;
}

/**
 * Creative-Commons track result on the landing page.
 *
 * Intentionally has no `platforms` / `platformsLabel` fields — CC tracks are
 * accessed directly via Jamendo rather than through a multi-platform link
 * grid. The `streamUrl` is the full-length permanent Jamendo audio stream
 * (not a 30-second preview). `attribution` is the pre-formatted credit line
 * shown beneath the artwork (e.g. the artist name or "Artist · CC BY 4.0").
 */
export interface CcTrackContentConfiguration {
  type: typeof MediaCardContentTypeValue.CcTrack;
  title: string;
  artist: string;
  /** Album title, if available. */
  album?: string;
  /** Track cover-art URL. */
  artworkUrl: string;
  /** Pre-computed meta line (e.g. "3:45 · 2023"). */
  metaLine?: string;
  /** LP paper-label album/title field. Kept structured so views never parse `metaLine`. */
  labelAlbumTitle?: string;
  /** LP paper-label year field, normally `YYYY`. Kept structured so views never parse `metaLine`. */
  labelReleaseYear?: string;
  /** LP paper-label catalog/imprint field such as ISRC, UPC, label or license text. */
  labelCatalogText?: string;
  /** LP paper-label rights field (top-left). Commercial defaults to "GEMA"; the
   *  Creative-Commons path sets the CC licence label, where "GEMA" is meaningless. */
  labelRightsText?: string;
  /** Pre-translated screen-reader announcement for the result. */
  srAnnouncement?: string;
  /** musiccloud short URL for the "Copy link" share action. */
  shortUrl: string;
  /** Short ID extracted from `shortUrl`, used by the audio player refresh endpoint. */
  shortId?: string;
  /** Full-track permanent stream URL (Jamendo `audio` field). */
  streamUrl: string;
  /** Canonical CC licence deed URL (e.g. `https://creativecommons.org/licenses/by/4.0/`). */
  licenseCcurl?: string;
  /**
   * Pre-parsed CC licence display label (e.g. `CC BY-NC-ND 3.0`), derived from
   * `licenseCcurl` by the config builder. Absent when the deed URL is missing
   * or cannot be parsed; the card falls back to the raw URL or an unknown-label
   * string in that case.
   */
  licenseLabel?: string;
  /**
   * Pre-formatted attribution credit line (typically the artist name,
   * optionally followed by a licence hint such as "CC BY 4.0").
   */
  attribution: string;
  /** Direct download URL. Only present when `downloadAllowed` is true. */
  downloadUrl?: string;
  /** Whether Jamendo permits direct download of this track. */
  downloadAllowed: boolean;
  /** Canonical Jamendo page URL for the "Open on Jamendo" link. */
  jamendoUrl?: string;
  /** Jamendo artist-profile URL (`https://www.jamendo.com/artist/<id>`) the artist name links to. */
  artistJamendoUrl?: string;
  /** Waveform image URL provided by Jamendo. */
  waveform?: string;
  /** `include=musicinfo` classification (genres, instruments, mood, vocal, …). Drives the CC details card; absent when Jamendo returned none. */
  musicInfo?: CcMusicInfo;
  /** `include=stats` engagement counters (listens, downloads, rating, …). Drives the CC details card; raw numbers, the card formats them. */
  stats?: CcTrackStats;
  /** True when the track is also licensable commercially via Jamendo Pro. Drives the CcInfoCard Pro hint. */
  proLicensing?: boolean;
  /** Jamendo Pro licensing page for the track, linked from the Pro hint when `proLicensing` is true. */
  proUrl?: string;
  /** Jamendo track id, used by the CcInfoCard's async "Buy on Bandcamp" lookup. */
  jamendoTrackId?: string;
}

/** Type guard: true for song, album, and artist configs (all have shareUrl / srAnnouncement) */
export function isShareableContent(
  content: MediaCardContentConfiguration,
): content is SongContentConfiguration | AlbumContentConfiguration | ArtistContentConfiguration {
  return (
    content.type === MediaCardContentTypeValue.Song ||
    content.type === MediaCardContentTypeValue.Album ||
    content.type === MediaCardContentTypeValue.Artist
  );
}

/** Type guard: true for share page config (has shortUrl). */
export function isSharePageContent(content: MediaCardContentConfiguration): content is ShareContentConfiguration {
  return content.type === MediaCardContentTypeValue.Share;
}

/**
 * Visibility flags for the platform well shared by `MediaCard` and
 * `ServicesCard`.
 *
 * @property showGrid - True when the content carries at least one platform link.
 * @property showInfoOnly - True when there are no links but an availability note
 *   exists (the "not found" / "only on X" case), so the well renders just the
 *   note without the grid.
 */
export interface PlatformsVisibility {
  showGrid: boolean;
  showInfoOnly: boolean;
}

/**
 * Derives the platform-well visibility flags from a media content config.
 *
 * Encodes the single rule both platform-rendering cards rely on: render the
 * grid when links exist, otherwise render the standalone availability note when
 * one is present. Keeping it here (next to the content type) means the rule has
 * one home instead of being re-typed in each card.
 *
 * @param content - The resolved media content configuration.
 * @returns The {@link PlatformsVisibility} flags for the platform well.
 */
export function derivePlatformsVisibility(content: MediaCardContentConfiguration): PlatformsVisibility {
  return {
    showGrid: content.platforms.length > 0,
    showInfoOnly: content.platforms.length === 0 && !!content.platformsInfo,
  };
}
