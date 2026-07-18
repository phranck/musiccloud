import {
  type ApiAlbum,
  type ApiArtistCredit,
  type ArtistInfoResponse,
  buildMetaLine,
  type CcAlbumSharePageResponse,
  type CcArtistSharePageResponse,
  type CcTrackSharePageResponse,
  type SharePageResponse,
  type UnifiedResolveSuccessResponse,
} from "@musiccloud/shared";
import { artistCopy } from "@/copy/artist";
import { resultsCopy } from "@/copy/results";
import { catalogTextFromIds, labelAlbumTitleFrom, releaseYearFromDate } from "@/lib/media/lp-label";
import { apiLinksToPlatformLinks } from "@/lib/platform/api-links";
import { buildShareConfigFromActive, ccResponseToResult, ccResultToShareProps } from "@/lib/resolve/parsers";
import { pathFromShortUrl } from "@/lib/share/short-url";
import { type ActiveResult, ActiveResultKind } from "@/lib/types/app";
import type { ShareContentConfiguration } from "@/lib/types/media-card";

/** A CC variant of {@link SharePageResponse} (track / album / artist). */
type CcSharePageResponse = CcTrackSharePageResponse | CcAlbumSharePageResponse | CcArtistSharePageResponse;

/** Narrows a {@link SharePageResponse} to its CC variants (which render through a dedicated path). */
export function isCcSharePageResponse(data: SharePageResponse): data is CcSharePageResponse {
  return data.type === "cc-track" || data.type === "cc-album" || data.type === "cc-artist";
}

/**
 * The server-built inputs the {@link CcSharePageShell} renders. Mirrors the CC
 * live view: the left media card (`config`, which for a track carries its
 * `ccInfoContent` license block), the right artist column (`artistInfo`), the CC
 * section-title overrides (`labels`), plus the page title and artwork for the
 * document head.
 */
export interface CcSharePageProps {
  config: ShareContentConfiguration;
  artistName: string;
  /** Pre-built artist column — set for cc-album/cc-artist, **unset for cc-track**
   *  (which loads it async via `config.ccJamendoArtistId`). */
  artistInfo?: ArtistInfoResponse;
  /** English artist-column title overrides for Creative Commons entities. */
  labels: { similar: string; profileProvidedBy: string };
  pageTitle: string;
  artworkUrl?: string | null;
}

/**
 * The English artist-column title overrides for CC entities. CC shows
 * "Similar Tracks" (not "Similar Artists") and credits Jamendo as the data
 * source.
 */
export const CC_ARTIST_LABELS: { similar: string; profileProvidedBy: string } = {
  similar: artistCopy.similarTracks,
  profileProvidedBy: artistCopy.profileProvidedByJamendo,
};

/**
 * Builds the {@link CcSharePageProps} for a CC share-page response, reusing the
 * CC live-view parsers ({@link ccResponseToResult} → {@link ccResultToShareProps}).
 * Runs server-side in the share-page routes so the client shell only renders.
 *
 * @param data - A CC share-page response.
 * @returns The render inputs for the CC share page.
 */
export function buildCcSharePageProps(data: CcSharePageResponse): CcSharePageProps {
  const result = ccResponseToResult(data);
  const { config, artistName } = ccResultToShareProps(result);
  return {
    config,
    artistName,
    artistInfo: result.artistInfo,
    labels: CC_ARTIST_LABELS,
    pageTitle: data.og.title,
    artworkUrl: config.artworkUrl,
  };
}

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

function resolvePlatformsLabel(isArtist: boolean, isAlbum: boolean): string {
  if (isArtist) return resultsCopy.viewArtistOn;
  if (isAlbum) return resultsCopy.openAlbumOn;
  return resultsCopy.listenOn;
}

function buildAlbumMetaLine(album: ApiAlbum): string | undefined {
  const year = album.releaseDate?.slice(0, 4);
  return (
    [album.totalTracks ? resultsCopy.albumTracks(album.totalTracks) : null, year].filter(Boolean).join(" \u00B7 ") ||
    undefined
  );
}

function buildArtistInfoContext(
  shortId: string | undefined,
  credits: ApiArtistCredit[] | undefined,
): ShareArtistInfoContext {
  const mainArtistCredit = credits?.find((credit) => credit.role === "main") ?? credits?.[0];
  return { shortId, artistEntityId: mainArtistCredit?.artistEntityId };
}

export function buildShareViewFromSharePageResponse(data: SharePageResponse, routeShortId: string): ShareViewModel {
  // CC share pages render through a dedicated path (added in a later slice); this
  // builder handles only the commercial track/album/artist response. The guard
  // also narrows `data` to CommercialSharePageResponse for the rest of the body.
  if (data.type === "cc-track" || data.type === "cc-album" || data.type === "cc-artist") {
    throw new Error(`buildShareViewFromSharePageResponse received a CC response (${data.type})`);
  }
  const isAlbum = data.type === "album";
  const isArtist = data.type === "artist";
  const track = data.type === "track" ? data.track : null;
  const album = data.type === "album" ? data.album : null;
  const artist = data.type === "artist" ? data.artist : null;
  const shortId = routeShortId || shortIdFromShortUrl(data.shortUrl);

  const artistDisplay = isArtist ? "" : isAlbum ? (album?.artists.join(", ") ?? "") : (track?.artists.join(", ") ?? "");
  const displayTitle = isArtist ? (artist?.name ?? "") : isAlbum ? (album?.title ?? "") : (track?.title ?? "");
  const artworkUrl = isArtist ? artist?.imageUrl : isAlbum ? album?.artworkUrl : track?.artworkUrl;
  const platformsLabel = resolvePlatformsLabel(isArtist, isAlbum);
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
        ? buildAlbumMetaLine(album)
        : track
          ? buildMetaLine({ durationMs: track.durationMs, releaseDate: track.releaseDate }) || undefined
          : undefined,
    labelAlbumTitle: isArtist
      ? (artist?.name ?? undefined)
      : isAlbum
        ? (album?.title ?? undefined)
        : labelAlbumTitleFrom(track?.albumName, track?.title),
    labelReleaseYear: isAlbum
      ? releaseYearFromDate(album?.releaseDate)
      : isArtist
        ? undefined
        : releaseYearFromDate(track?.releaseDate),
    labelCatalogText: isAlbum
      ? catalogTextFromIds({ label: album?.label, upc: album?.upc })
      : isArtist
        ? undefined
        : catalogTextFromIds({ isrc: track?.isrc }),
    vinylLayout: isAlbum ? (album?.vinylLayout ?? undefined) : (track?.vinylLayout ?? undefined),
    platforms: apiLinksToPlatformLinks(data.links),
    platformsLabel,
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

export function buildShareViewFromResolvedResponse(data: UnifiedResolveSuccessResponse): ShareViewModel {
  const common = {
    links: data.links,
    shortUrl: data.shortUrl,
  };
  const shareData: SharePageResponse =
    data.type === "track"
      ? {
          ...common,
          type: data.type,
          og: { title: "", description: "", image: data.track.artworkUrl ?? "", url: data.shortUrl },
          track: data.track,
        }
      : data.type === "album"
        ? {
            ...common,
            type: data.type,
            og: { title: "", description: "", image: data.album.artworkUrl ?? "", url: data.shortUrl },
            album: data.album,
          }
        : {
            ...common,
            type: data.type,
            og: { title: "", description: "", image: data.artist.imageUrl ?? "", url: data.shortUrl },
            artist: data.artist,
          };
  return buildShareViewFromSharePageResponse(shareData, shortIdFromShortUrl(data.shortUrl) ?? "");
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
 * @returns The {@link ActiveShareSelection} for the landing page.
 */
export function buildActiveShareSelection(
  resolved: UnifiedResolveSuccessResponse | null,
  active: ActiveResult | null,
): ActiveShareSelection {
  const activeShareView = resolved ? buildShareViewFromResolvedResponse(resolved) : null;
  const activeShareConfig = activeShareView?.config ?? (active ? buildShareConfigFromActive(active) : null);
  const activeArtistName =
    activeShareView?.artistName ??
    (active ? (active.kind === ActiveResultKind.Artist ? active.name : active.artist) : "");
  return { activeShareView, activeShareConfig, activeArtistName };
}
