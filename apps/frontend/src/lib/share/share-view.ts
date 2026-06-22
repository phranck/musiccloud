import { buildMetaLine, type SharePageResponse, type UnifiedResolveSuccessResponse } from "@musiccloud/shared";
import { apiLinksToPlatformLinks } from "@/lib/platform/api-links";
import { pathFromShortUrl } from "@/lib/share/short-url";
import type { ShareContentConfiguration } from "@/lib/types/media-card";

type TFunc = (key: string, vars?: Record<string, string>) => string;

export interface ShareArtistInfoContext {
  shortId?: string;
  artistEntityId?: string;
}

export interface ShareViewModel {
  config: ShareContentConfiguration;
  artistName: string;
  artistInfoContext: ShareArtistInfoContext;
  displayTitle: string;
  artistDisplay: string;
  artworkUrl?: string | null;
  pageTitle: string;
  isAlbum: boolean;
  isArtist: boolean;
}

/**
 * Extracts the leading short-id segment from a musiccloud short URL.
 *
 * Derives the path through {@link pathFromShortUrl} (which centralizes the
 * SSR/browser origin convention), strips leading slashes, and returns the first
 * path segment. Returns `undefined` when the URL has no usable segment.
 *
 * @param shortUrl - The short URL to read the id from.
 * @returns The short id (e.g. `abc123`), or `undefined` when none is present.
 */
function shortIdFromShortUrl(shortUrl: string): string | undefined {
  const shortId = pathFromShortUrl(shortUrl).replace(/^\/+/, "").split("/")[0];
  return shortId || undefined;
}

function resolvePlatformsLabelKey(isArtist: boolean, isAlbum: boolean): string {
  if (isArtist) return "results.viewArtistOn";
  if (isAlbum) return "results.openAlbumOn";
  return "results.listenOn";
}

function buildAlbumMetaLine(album: NonNullable<SharePageResponse["album"]>, t: TFunc): string | undefined {
  const year = album.releaseDate?.slice(0, 4);
  return (
    [album.totalTracks ? t("results.albumTracks", { count: String(album.totalTracks) }) : null, year]
      .filter(Boolean)
      .join(" \u00B7 ") || undefined
  );
}

function buildArtistInfoContext(
  shortId: string | undefined,
  credits: NonNullable<SharePageResponse["track"]>["artistCredits"],
): ShareArtistInfoContext {
  const mainArtistCredit = credits?.find((credit) => credit.role === "main") ?? credits?.[0];
  return { shortId, artistEntityId: mainArtistCredit?.artistEntityId };
}

export function buildShareViewFromSharePageResponse(
  data: SharePageResponse,
  routeShortId: string,
  t: TFunc,
): ShareViewModel {
  const isAlbum = data.type === "album";
  const isArtist = data.type === "artist";
  const track = data.track ?? null;
  const album = data.album ?? null;
  const artist = data.artist ?? null;
  const shortId = routeShortId || shortIdFromShortUrl(data.shortUrl);

  const artistDisplay = isArtist ? "" : isAlbum ? (album?.artists.join(", ") ?? "") : (track?.artists.join(", ") ?? "");
  const displayTitle = isArtist ? (artist?.name ?? "") : isAlbum ? (album?.title ?? "") : (track?.title ?? "");
  const artworkUrl = isArtist ? artist?.imageUrl : isAlbum ? album?.artworkUrl : track?.artworkUrl;
  const platformsLabelKey = resolvePlatformsLabelKey(isArtist, isAlbum);
  const artistCredits = isAlbum ? album?.artistCredits : isArtist ? undefined : track?.artistCredits;

  const config: ShareContentConfiguration = {
    type: "share",
    title: displayTitle,
    artist: artistDisplay,
    artworkUrl: artworkUrl ?? "",
    album: isAlbum ? undefined : (track?.albumName ?? undefined),
    isExplicit: !isAlbum && !isArtist && track?.isExplicit ? true : undefined,
    previewUrl: isArtist ? undefined : isAlbum ? (album?.previewUrl ?? undefined) : (track?.previewUrl ?? undefined),
    previewRefreshable: !isArtist && !isAlbum ? track?.previewRefreshable : undefined,
    shortId,
    metaLine: isArtist
      ? artist?.genres?.join(", ") || undefined
      : isAlbum && album
        ? buildAlbumMetaLine(album, t)
        : track
          ? buildMetaLine({ durationMs: track.durationMs, releaseDate: track.releaseDate }) || undefined
          : undefined,
    platforms: apiLinksToPlatformLinks(data.links),
    platformsLabel: t(platformsLabelKey),
    platformsLabelKey,
    shortUrl: data.shortUrl,
  };

  return {
    config,
    artistName: isArtist ? displayTitle : artistDisplay,
    artistInfoContext: buildArtistInfoContext(shortId, artistCredits),
    displayTitle,
    artistDisplay,
    artworkUrl,
    pageTitle: isArtist ? `${displayTitle} - musiccloud` : `${displayTitle} by ${artistDisplay} - musiccloud`,
    isAlbum,
    isArtist,
  };
}

export function buildShareViewFromResolvedResponse(data: UnifiedResolveSuccessResponse, t: TFunc): ShareViewModel {
  const shareData: SharePageResponse = {
    type: data.type,
    og: {
      title: "",
      description: "",
      url: data.shortUrl,
    },
    track: data.type === "track" ? data.track : undefined,
    album: data.type === "album" ? data.album : undefined,
    artist: data.type === "artist" ? data.artist : undefined,
    links: data.links,
    shortUrl: data.shortUrl,
  };
  return buildShareViewFromSharePageResponse(shareData, shortIdFromShortUrl(data.shortUrl) ?? "", t);
}
