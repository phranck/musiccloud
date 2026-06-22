import {
  type ApiAlbum,
  type ApiArtistCredit,
  buildMetaLine,
  type SharePageResponse,
  type UnifiedResolveSuccessResponse,
} from "@musiccloud/shared";
import { apiLinksToPlatformLinks } from "@/lib/platform/api-links";
import { buildShareConfigFromActive } from "@/lib/resolve/parsers";
import { pathFromShortUrl } from "@/lib/share/short-url";
import { type ActiveResult, ActiveResultKind } from "@/lib/types/app";
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

function buildAlbumMetaLine(album: ApiAlbum, t: TFunc): string | undefined {
  const year = album.releaseDate?.slice(0, 4);
  return (
    [album.totalTracks ? t("results.albumTracks", { count: String(album.totalTracks) }) : null, year]
      .filter(Boolean)
      .join(" \u00B7 ") || undefined
  );
}

function buildArtistInfoContext(
  shortId: string | undefined,
  credits: ApiArtistCredit[] | undefined,
): ShareArtistInfoContext {
  const mainArtistCredit = credits?.find((credit) => credit.role === "main") ?? credits?.[0];
  return { shortId, artistEntityId: mainArtistCredit?.artistEntityId };
}

export function buildShareViewFromSharePageResponse(
  data: SharePageResponse,
  routeShortId: string,
  t: TFunc,
): ShareViewModel {
  // CC share pages render through a dedicated path (added in a later slice); this
  // builder handles only the commercial track/album/artist response. The guard
  // also narrows `data` to CommercialSharePageResponse for the rest of the body.
  if (data.type === "cc-track" || data.type === "cc-album" || data.type === "cc-artist") {
    throw new Error(`buildShareViewFromSharePageResponse received a CC response (${data.type})`);
  }
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

/**
 * The commercial share-result selection the landing page renders for the active
 * resolved entity.
 *
 * @property activeShareView - The full {@link ShareViewModel} when a `resolved`
 *   response is present (the richest source), otherwise `null`. The caller reads
 *   `artistInfoContext` from it.
 * @property activeShareConfig - The media-card configuration for the result, or
 *   `null` when neither a resolved response nor an `active` result exists.
 * @property activeArtistName - The artist name driving the shared artist column.
 */
export interface ActiveShareSelection {
  activeShareView: ShareViewModel | null;
  activeShareConfig: ShareContentConfiguration | null;
  activeArtistName: string;
}

/**
 * Derives the commercial share-result selection from the two app-state sources.
 *
 * A fully resolved response is the richest source: it yields the share view
 * model directly. When only the lighter `active` result is on state, the config
 * and artist name fall back to it — applying the model rule that an artist's
 * "artist name" is its own `name`, while a song/album uses its `artist` field.
 * Centralizing that branch here keeps the discriminant rule out of the page.
 *
 * @param resolved - The resolved success response, or `null`.
 * @param active - The lighter active result, or `null`.
 * @param t - Translation function (forwarded to the config builders).
 * @returns The {@link ActiveShareSelection} for the landing page.
 */
export function buildActiveShareSelection(
  resolved: UnifiedResolveSuccessResponse | null,
  active: ActiveResult | null,
  t: TFunc,
): ActiveShareSelection {
  const activeShareView = resolved ? buildShareViewFromResolvedResponse(resolved, t) : null;
  const activeShareConfig = activeShareView?.config ?? (active ? buildShareConfigFromActive(active, t) : null);
  const activeArtistName =
    activeShareView?.artistName ??
    (active ? (active.kind === ActiveResultKind.Artist ? active.name : active.artist) : "");
  return { activeShareView, activeShareConfig, activeArtistName };
}
