import type {
  AlbumResolveSuccessResponse,
  ArtistResolveSuccessResponse,
  ResolveSuccessResponse,
} from "@musiccloud/shared";
import { buildMetaLine, isValidServiceId, PLATFORM_CONFIG, type ServiceId } from "@musiccloud/shared";
import type { ActiveResult, AlbumResult, AppAction, AppState, ArtistResult, SongResult } from "@/lib/types/app";
import type {
  AlbumContentConfiguration,
  ArtistContentConfiguration,
  SongContentConfiguration,
} from "@/lib/types/media-card";
import type { PlatformLink } from "@/lib/types/platform";

// ---------------------------------------------------------------------------
// App state reducer
// ---------------------------------------------------------------------------

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SUBMIT":
      return { type: "loading" };
    case "RESOLVE_SUCCESS":
      return { type: "result", active: action.active };
    case "DISAMBIGUATION":
      return { type: "disambiguation", candidates: action.candidates };
    case "SELECT_CANDIDATE":
      if (state.type === "disambiguation")
        return { type: "disambiguation_loading", candidates: state.candidates, selectedId: action.selectedId };
      return state;
    case "ERROR":
      return { type: "error", message: action.message };
    case "CLEAR_START":
      if (state.type === "result") return { type: "clearing", active: state.active };
      return { type: "idle" };
    case "CLEAR":
      return { type: "idle" };
  }
}

// ---------------------------------------------------------------------------
// Response parsers
// ---------------------------------------------------------------------------

export function parseResolveResponse(data: ResolveSuccessResponse): SongResult {
  const platforms: PlatformLink[] = data.links
    .filter((link) => link.url && isValidServiceId(link.service))
    .map((link) => ({
      platform: link.service as ServiceId,
      url: link.url,
      displayName: link.displayName,
      matchMethod: link.matchMethod,
    }));
  return {
    kind: "song",
    title: data.track.title,
    artist: data.track.artists.join(", "),
    album: data.track.albumName,
    releaseDate: data.track.releaseDate,
    durationMs: data.track.durationMs,
    isrc: data.track.isrc,
    isExplicit: data.track.isExplicit,
    artworkUrl: data.track.artworkUrl ?? "",
    previewUrl: data.track.previewUrl,
    platforms,
    shareUrl: data.shortUrl,
  };
}

export function parseAlbumResolveResponse(data: AlbumResolveSuccessResponse): AlbumResult {
  const platforms: PlatformLink[] = data.links
    .filter((link) => link.url && isValidServiceId(link.service))
    .map((link) => ({
      platform: link.service as ServiceId,
      url: link.url,
      displayName: link.displayName,
      matchMethod: link.matchMethod,
    }));
  return {
    kind: "album",
    title: data.album.title,
    artist: data.album.artists.join(", "),
    releaseDate: data.album.releaseDate,
    totalTracks: data.album.totalTracks,
    artworkUrl: data.album.artworkUrl ?? "",
    label: data.album.label,
    upc: data.album.upc,
    previewUrl: data.album.previewUrl,
    platforms,
    shareUrl: data.shortUrl,
  };
}

export function parseArtistResolveResponse(data: ArtistResolveSuccessResponse): ArtistResult {
  const platforms: PlatformLink[] = data.links
    .filter((link) => link.url && isValidServiceId(link.service))
    .map((link) => ({
      platform: link.service as ServiceId,
      url: link.url,
      displayName: link.displayName,
      matchMethod: link.matchMethod,
    }));
  return {
    kind: "artist",
    name: data.artist.name,
    imageUrl: data.artist.imageUrl ?? "",
    genres: data.artist.genres,
    platforms,
    shareUrl: data.shortUrl,
  };
}

export function parseErrorKey(err: unknown): string {
  if (err instanceof TypeError && err.message.includes("Failed to fetch")) return "error.offline";
  if (err instanceof Error && err.name === "AbortError") return "error.timeout";
  // Pass through backend error messages directly (they are already user-friendly from USER_MESSAGES).
  // t() returns the string as-is when no translation key matches.
  if (err instanceof Error && err.message && !err.message.startsWith("error.")) return err.message;
  return "error.generic";
}

// ---------------------------------------------------------------------------
// Display configuration builders
// ---------------------------------------------------------------------------

type TFunc = (key: string, vars?: Record<string, string>) => string;

export function getPlatformsInfo(platforms: PlatformLink[], t: TFunc): string | undefined {
  const count = platforms.length;
  if (count === 0) return t("results.notFound");
  if (count === 2) return t("results.foundOn2");
  if (count === 1) {
    const name = platforms[0].displayName ?? PLATFORM_CONFIG[platforms[0].platform]?.label ?? platforms[0].platform;
    return t("results.onlyAvailable", { service: name });
  }
  return undefined;
}

export function buildActiveConfig(
  active: ActiveResult,
  t: TFunc,
  onAlbumArtLoad: (img: HTMLImageElement) => void,
): SongContentConfiguration | AlbumContentConfiguration | ArtistContentConfiguration {
  const platformsInfo = getPlatformsInfo(active.platforms, t);

  if (active.kind === "song") {
    return {
      type: "song",
      title: active.title,
      artist: active.artist,
      album: active.album,
      artworkUrl: active.artworkUrl,
      isExplicit: active.isExplicit,
      previewUrl: active.previewUrl,
      metaLine: buildMetaLine({ durationMs: active.durationMs, releaseDate: active.releaseDate }) || undefined,
      platforms: active.platforms,
      platformsLabel: t("results.listenOn"),
      platformsInfo,
      shareUrl: active.shareUrl,
      srAnnouncement: t("results.found", { title: active.title, artist: active.artist }),
      onAlbumArtLoad,
    };
  }

  if (active.kind === "artist") {
    const genreLine = active.genres?.join(", ");

    return {
      type: "artist",
      title: active.name,
      artist: "",
      artworkUrl: active.imageUrl,
      metaLine: genreLine || undefined,
      platforms: active.platforms,
      platformsLabel: t("results.viewArtistOn"),
      platformsInfo,
      shareUrl: active.shareUrl,
      srAnnouncement: t("results.foundArtist", { name: active.name }),
      onAlbumArtLoad,
    };
  }

  const year = active.releaseDate?.slice(0, 4);
  const metaParts = [
    active.totalTracks ? t("results.albumTracks", { count: String(active.totalTracks) }) : null,
    year,
  ].filter(Boolean) as string[];

  return {
    type: "album",
    title: active.title,
    artist: active.artist,
    artworkUrl: active.artworkUrl,
    previewUrl: active.previewUrl,
    metaLine: metaParts.join(" \u00B7") || undefined,
    platforms: active.platforms,
    platformsLabel: t("results.openAlbumOn"),
    platformsInfo,
    shareUrl: active.shareUrl,
    srAnnouncement: t("results.foundAlbum", { title: active.title, artist: active.artist }),
    onAlbumArtLoad,
  };
}
