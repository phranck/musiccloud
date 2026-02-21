import { isValidPlatform, type Platform } from "@musiccloud/shared";
import { getRepository } from "../../db/index.js";
import { generateAlbumOGMeta, generateOGMeta, type OGMeta } from "./og.js";

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

  return enrichWithOGMeta(data, data.shortId, origin);
}

/** Load share page data by track ID. Returns null if not found. */
export async function loadByTrackId(trackId: string, origin?: string): Promise<SharePageData | null> {
  const repo = await getRepository();
  const data = await repo.loadByTrackId(trackId);
  if (!data) return null;

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
