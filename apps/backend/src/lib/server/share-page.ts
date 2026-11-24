import { isValidServiceId, type ServiceId, type VinylLayout } from "@musiccloud/shared";
import { getRepository } from "../../db/index.js";
import type { ArtistCredit } from "../../db/repository.js";
import { pickRecordingArtworkUrl } from "../../services/artwork.js";
import { isAlbumPreviewRefreshable, isTrackPreviewRefreshable } from "../../services/preview-refresh.js";
import { rewriteAppleMusicUrlForStorefront } from "../platform/apple-music-storefront.js";
import { isExpiredPreviewUrl } from "../preview-url.js";
import { getPublicOrigin } from "../public-origin.js";
import { normalizeReleaseDate } from "../release-date.js";
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

function rewriteLinksForAppleMusicStorefront<T extends { service: string; url: string }>(
  links: T[],
  appleMusicStorefront: string | null,
): T[] {
  return links.map((link) =>
    link.service === "apple-music"
      ? { ...link, url: rewriteAppleMusicUrlForStorefront(link.url, appleMusicStorefront) }
      : link,
  );
}

/** Load share page data by short URL ID. Returns null if not found.
 *
 *  The hot path does NOT contact Deezer. If the stored preview URL is an
 *  expired Deezer CDN token, it is nulled out and `previewRefreshable` is
 *  set so the client can request a fresh URL via the preview endpoint.
 *  This keeps the share-page response latency bounded by database alone.
 *  Stored recording artwork is filtered without network calls or repair writes.
 *  Enrichment belongs to the resolver, not a share-page read.
 *
 *  Apple Music is the exception to "cached service link is globally portable".
 *  Its catalogue links carry the storefront in the URL, so the cached link's
 *  storefront segment is rewritten to the viewer storefront here, so the same
 *  global catalogue ID opens directly in the viewer's region instead of a
 *  foreign native-app deep link. The DB cache keeps its original storefront.
 */
export async function loadByShortId(
  shortId: string,
  origin?: string,
  appleMusicStorefront: string | null = null,
): Promise<SharePageData | null> {
  const repo = await getRepository();
  const data = await repo.loadByShortId(shortId);
  if (!data) return null;

  data.track.releaseDate = normalizeReleaseDate(data.track.releaseDate);
  const expired = !!data.track.previewUrl && isExpiredPreviewUrl(data.track.previewUrl);
  if (expired) data.track.previewUrl = null;

  const previewRefreshable = !data.track.previewUrl && isTrackPreviewRefreshable(data.track.isrc, data.links);
  return enrichWithOGMeta(
    { ...data, links: rewriteLinksForAppleMusicStorefront(data.links, appleMusicStorefront) },
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

  data.track.releaseDate = normalizeReleaseDate(data.track.releaseDate);
  const expired = !!data.track.previewUrl && isExpiredPreviewUrl(data.track.previewUrl);
  if (expired) data.track.previewUrl = null;

  const previewRefreshable = !data.track.previewUrl && isTrackPreviewRefreshable(data.track.isrc, data.links);
  return enrichWithOGMeta(
    { ...data, links: rewriteLinksForAppleMusicStorefront(data.links, appleMusicStorefront) },
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
    vinylLayout: VinylLayout | null;
  };
  artists: string[];
  artistCredits: ArtistCredit[];
  artistDisplay: string;
  shortId: string;
  links: { service: string; url: string }[];
  availablePlatforms: ServiceId[];
  /** True when the stored preview was missing or an expired Deezer URL and
   *  the client can fetch a fresh one through the preview endpoint, the same
   *  as {@link SharePageData.previewRefreshable} for a track. */
  previewRefreshable: boolean;
  og: OGMeta;
}

/**
 * Load album share page data by short URL ID. Returns null if not found.
 *
 * Like {@link loadByShortId}, the hot path does not contact Deezer. An expired
 * Deezer preview is dropped and `previewRefreshable` is set, so the player
 * asks the preview endpoint for a fresh URL.
 */
export async function loadAlbumByShortId(
  shortId: string,
  origin?: string,
  appleMusicStorefront: string | null = null,
): Promise<ShareAlbumPageData | null> {
  const repo = await getRepository();
  const data = await repo.loadAlbumByShortId(shortId);
  if (!data) return null;

  // Writes normalize the date, and a row stored before they did can still hold
  // a raw value that the response schema's `format: date` would refuse.
  const album = {
    ...data.album,
    releaseDate: normalizeReleaseDate(data.album.releaseDate),
    artworkUrl: pickRecordingArtworkUrl(data.album.artworkUrl ?? undefined) ?? null,
  };
  const links = rewriteLinksForAppleMusicStorefront(data.links, appleMusicStorefront);
  const availablePlatforms: ServiceId[] = links.map((l) => l.service).filter(isValidServiceId);

  const expired = !!album.previewUrl && isExpiredPreviewUrl(album.previewUrl);
  if (expired) album.previewUrl = null;
  const previewRefreshable = !album.previewUrl && isAlbumPreviewRefreshable(data.links);

  const og = generateAlbumOGMeta({
    title: album.title,
    artist: data.artistDisplay,
    totalTracks: album.totalTracks ?? undefined,
    releaseDate: album.releaseDate ?? undefined,
    // Empty string lets generateAlbumOGMeta apply its absolute default-image fallback.
    albumArtUrl: album.artworkUrl ?? "",
    shortId: data.shortId,
    availablePlatforms,
    origin,
  });

  return {
    ...data,
    album,
    links,
    availablePlatforms,
    previewRefreshable,
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

  const links = rewriteLinksForAppleMusicStorefront(data.links, appleMusicStorefront);
  const availablePlatforms: ServiceId[] = links.map((l) => l.service).filter(isValidServiceId);

  const baseUrl = origin ?? getPublicOrigin();
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
  const track = { ...data.track, artworkUrl: pickRecordingArtworkUrl(data.track.artworkUrl ?? undefined) ?? null };

  const og = generateOGMeta({
    title: data.track.title,
    artist: data.artistDisplay,
    album: data.track.albumName ?? undefined,
    // Empty string lets generateOGMeta apply its absolute default-image fallback.
    albumArtUrl: track.artworkUrl ?? "",
    shortId,
    availablePlatforms,
    origin,
  });

  return {
    ...data,
    track,
    availablePlatforms,
    previewRefreshable,
    og,
  };
}
