import { isValidServiceId, type ServiceId } from "@musiccloud/shared";
import { getRepository } from "../../db/index.js";
import type { ArtistCredit } from "../../db/repository.js";
import { deezerAdapter } from "../../services/plugins/deezer/adapter.js";
import { isAppleMusicLinkRenderableForStorefront } from "../platform/apple-music-storefront.js";
import { isExpiredDeezerPreviewUrl } from "../preview-url.js";
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
  artistCredits: ArtistCredit[];
  artistDisplay: string;
  shortId: string;
  trackId: string;
  links: { service: string; url: string }[];
  availablePlatforms: ServiceId[];
  /** True when the hot-path returned an expired/missing Deezer preview URL
   *  that the client can refresh on-demand via the dedicated endpoint. */
  previewRefreshable: boolean;
  og: OGMeta;
}

function filterLinksForAppleMusicStorefront<T extends { service: string; url: string }>(
  links: T[],
  appleMusicStorefront: string | null,
): T[] {
  return links.filter((link) => {
    if (link.service !== "apple-music") return true;
    return isAppleMusicLinkRenderableForStorefront(link.url, appleMusicStorefront);
  });
}

/** Load share page data by short URL ID. Returns null if not found.
 *
 *  The hot path does NOT contact Deezer. If the stored preview URL is an
 *  expired Deezer CDN token, it is nulled out and `previewRefreshable` is
 *  set so the client can request a fresh URL via the preview endpoint.
 *  This keeps the share-page response latency bounded by database alone.
 *
 *  Apple Music is the exception to "cached service link means globally
 *  renderable". Its catalogue links carry the storefront in the URL and can
 *  fail in the native app outside that storefront. Filtering here keeps the
 *  DB cache intact while preventing stale US-only Apple links from appearing
 *  for AT/DE/etc. users.
 */
export async function loadByShortId(
  shortId: string,
  origin?: string,
  appleMusicStorefront: string | null = null,
): Promise<SharePageData | null> {
  const repo = await getRepository();
  const data = await repo.loadByShortId(shortId);
  if (!data) return null;

  const expired = !!data.track.previewUrl && isExpiredDeezerPreviewUrl(data.track.previewUrl);
  if (expired) data.track.previewUrl = null;

  const previewRefreshable = !data.track.previewUrl && !!data.track.isrc && deezerAdapter.isAvailable();
  return enrichWithOGMeta(
    { ...data, links: filterLinksForAppleMusicStorefront(data.links, appleMusicStorefront) },
    data.shortId,
    origin,
    previewRefreshable,
  );
}

/** Load share page data by track ID. Returns null if not found. */
export async function loadByTrackId(
  trackId: string,
  origin?: string,
  appleMusicStorefront: string | null = null,
): Promise<SharePageData | null> {
  const repo = await getRepository();
  const data = await repo.loadByTrackId(trackId);
  if (!data) return null;

  const expired = !!data.track.previewUrl && isExpiredDeezerPreviewUrl(data.track.previewUrl);
  if (expired) data.track.previewUrl = null;

  const previewRefreshable = !data.track.previewUrl && !!data.track.isrc && deezerAdapter.isAvailable();
  return enrichWithOGMeta(
    { ...data, links: filterLinksForAppleMusicStorefront(data.links, appleMusicStorefront) },
    data.shortId,
    origin,
    previewRefreshable,
  );
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
  artistCredits: ArtistCredit[];
  artistDisplay: string;
  shortId: string;
  links: { service: string; url: string }[];
  availablePlatforms: ServiceId[];
  og: OGMeta;
}

/** Load album share page data by short URL ID. Returns null if not found. */
export async function loadAlbumByShortId(
  shortId: string,
  origin?: string,
  appleMusicStorefront: string | null = null,
): Promise<ShareAlbumPageData | null> {
  const repo = await getRepository();
  const data = await repo.loadAlbumByShortId(shortId);
  if (!data) return null;

  const links = filterLinksForAppleMusicStorefront(data.links, appleMusicStorefront);
  const availablePlatforms: ServiceId[] = links.map((l) => l.service).filter(isValidServiceId);

  const og = generateAlbumOGMeta({
    title: data.album.title,
    artist: data.artistDisplay,
    totalTracks: data.album.totalTracks ?? undefined,
    releaseDate: data.album.releaseDate ?? undefined,
    // Empty string lets generateAlbumOGMeta apply its absolute default-image fallback.
    albumArtUrl: data.album.artworkUrl ?? "",
    shortId,
    availablePlatforms,
    origin,
  });

  return {
    ...data,
    links,
    availablePlatforms,
    og,
  };
}

// --- Artist Share Page ---

export interface ShareArtistPageData {
  artist: {
    name: string;
    imageUrl: string | null;
    genres: string[];
  };
  shortId: string;
  links: { service: string; url: string }[];
  availablePlatforms: ServiceId[];
  og: OGMeta;
}

/** Load artist share page data by short URL ID. Returns null if not found. */
export async function loadArtistByShortId(
  shortId: string,
  origin?: string,
  appleMusicStorefront: string | null = null,
): Promise<ShareArtistPageData | null> {
  const repo = await getRepository();
  const data = await repo.loadArtistByShortId(shortId);
  if (!data) return null;

  const links = filterLinksForAppleMusicStorefront(data.links, appleMusicStorefront);
  const availablePlatforms: ServiceId[] = links.map((l) => l.service).filter(isValidServiceId);

  const baseUrl = origin ?? "https://musiccloud.io";
  const og: OGMeta = {
    pageTitle: `${data.artist.name} - musiccloud`,
    ogTitle: `${data.artist.name} - musiccloud`,
    ogDescription: `Listen to ${data.artist.name} on ${availablePlatforms.length} platforms`,
    // Absolute URL: og:image must be absolute (crawler previews + `format: uri`).
    ogImageUrl: data.artist.imageUrl ?? `${baseUrl}/og/default.jpg`,
    ogUrl: `${baseUrl}/${shortId}`,
    twitterCard: "summary_large_image",
  };

  return {
    ...data,
    links,
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
    trackId: string;
    artists: string[];
    artistCredits: ArtistCredit[];
    artistDisplay: string;
    shortId: string;
    links: { service: string; url: string }[];
  },
  shortId: string,
  origin: string | undefined,
  previewRefreshable: boolean,
): SharePageData {
  const availablePlatforms: ServiceId[] = data.links.map((l) => l.service).filter(isValidServiceId);

  const og = generateOGMeta({
    title: data.track.title,
    artist: data.artistDisplay,
    album: data.track.albumName ?? undefined,
    // Empty string lets generateOGMeta apply its absolute default-image fallback.
    albumArtUrl: data.track.artworkUrl ?? "",
    shortId,
    availablePlatforms,
    origin,
  });

  return {
    ...data,
    availablePlatforms,
    previewRefreshable,
    og,
  };
}
