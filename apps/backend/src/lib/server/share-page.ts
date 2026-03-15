import { isValidPlatform, type Platform } from "@musiccloud/shared";
import { getRepository } from "../../db/index.js";
import { generateAlbumOGMeta, generateOGMeta, type OGMeta } from "./og.js";
import { deezerAdapter } from "../../services/adapters/deezer.js";
import { log } from "../infra/logger.js";
import { isExpiredDeezerPreviewUrl } from "../preview-url.js";

export interface SharePageData {
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
  artistDisplay: string;
  shortId: string;
  links: { service: string; url: string }[];
  availablePlatforms: Platform[];
  og: OGMeta;
}

/** Load share page data by short URL ID. Returns null if not found. */
export async function loadByShortId(shortId: string, origin?: string): Promise<SharePageData | null> {
  const repo = await getRepository();
  const data = await repo.loadByShortId(shortId);
  if (!data) return null;

  const needsPreviewRefresh =
    !data.track.previewUrl ||
    isExpiredDeezerPreviewUrl(data.track.previewUrl);

  // Refresh missing or expired Deezer preview URLs via ISRC lookup and persist
  // the refreshed URL so subsequent requests can use it directly.
  if (needsPreviewRefresh && data.track.isrc && deezerAdapter.isAvailable()) {
    try {
      const deezerTrack = await deezerAdapter.findByIsrc(data.track.isrc);
      if (deezerTrack?.previewUrl) {
        await repo.updatePreviewUrl(data.trackId, deezerTrack.previewUrl);
        data.track.previewUrl = deezerTrack.previewUrl;
      }
    } catch (err) {
      log.debug("SharePage", "Deezer preview enrichment failed:", err instanceof Error ? err.message : String(err));
    }
  }

  return enrichWithOGMeta(data, data.shortId, origin);
}

/** Load share page data by track ID. Returns null if not found. */
export async function loadByTrackId(trackId: string, origin?: string): Promise<SharePageData | null> {
  const repo = await getRepository();
  const data = await repo.loadByTrackId(trackId);
  if (!data) return null;

  const needsPreviewRefresh =
    !data.track.previewUrl ||
    isExpiredDeezerPreviewUrl(data.track.previewUrl);

  if (needsPreviewRefresh && data.track.isrc && deezerAdapter.isAvailable()) {
    try {
      const deezerTrack = await deezerAdapter.findByIsrc(data.track.isrc);
      if (deezerTrack?.previewUrl) {
        await repo.updatePreviewUrl(data.trackId, deezerTrack.previewUrl);
        data.track.previewUrl = deezerTrack.previewUrl;
      }
    } catch (err) {
      log.debug("SharePage", "Deezer preview enrichment failed:", err instanceof Error ? err.message : String(err));
    }
  }

  return enrichWithOGMeta(data, data.shortId, origin);
}

// ─── Album Share Page ─────────────────────────────────────────────────────────

export interface ShareAlbumPageData {
  album: {
    title: string;
    artworkUrl: string | null;
    releaseDate: string | null;
    totalTracks: number | null;
    label: string | null;
    upc: string | null;
    previewUrl: string | null;
  };
  artists: string[];
  artistDisplay: string;
  shortId: string;
  links: { service: string; url: string }[];
  availablePlatforms: Platform[];
  og: OGMeta;
}

/** Load album share page data by short URL ID. Returns null if not found. */
export async function loadAlbumByShortId(shortId: string, origin?: string): Promise<ShareAlbumPageData | null> {
  const repo = await getRepository();
  const data = await repo.loadAlbumByShortId(shortId);
  if (!data) return null;

  const availablePlatforms: Platform[] = data.links.map((l) => l.service).filter(isValidPlatform);

  const og = generateAlbumOGMeta({
    title: data.album.title,
    artist: data.artistDisplay,
    totalTracks: data.album.totalTracks ?? undefined,
    releaseDate: data.album.releaseDate ?? undefined,
    albumArtUrl: data.album.artworkUrl ?? "/og/default.jpg",
    shortId,
    availablePlatforms,
    origin,
  });

  return {
    ...data,
    availablePlatforms,
    og,
  };
}

function enrichWithOGMeta(
  data: {
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
    artistDisplay: string;
    shortId: string;
    links: { service: string; url: string }[];
  },
  shortId: string,
  origin?: string,
): SharePageData {
  const availablePlatforms: Platform[] = data.links.map((l) => l.service).filter(isValidPlatform);

  const og = generateOGMeta({
    title: data.track.title,
    artist: data.artistDisplay,
    album: data.track.albumName ?? undefined,
    albumArtUrl: data.track.artworkUrl ?? "/og/default.jpg",
    shortId,
    availablePlatforms,
    origin,
  });

  return {
    ...data,
    availablePlatforms,
    og,
  };
}
