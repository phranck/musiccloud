import type {
  AlbumResolveSuccessResponse,
  ArtistResolveSuccessResponse,
  ResolveSuccessResponse,
} from "@musiccloud/shared";
import { buildMetaLine, isValidServiceId, PLATFORM_CONFIG, type ServiceId } from "@musiccloud/shared";
import type { ActiveResult, AlbumResult, AppAction, ArtistResult, ReducerState, SongResult } from "@/lib/types/app";
import type {
  AlbumContentConfiguration,
  ArtistContentConfiguration,
  SongContentConfiguration,
} from "@/lib/types/media-card";
import type { PlatformLink } from "@/lib/types/platform";

// ---------------------------------------------------------------------------
// App state reducer
// ---------------------------------------------------------------------------

export function appReducer({ screen, stack }: ReducerState, action: AppAction): ReducerState {
  switch (action.type) {
    case "SUBMIT":
      // Navigating from genre-browse preserves the browse state for back-navigation.
      // Any other submission starts a fresh journey (stack cleared).
      if (screen.type === "genre-browse") return { screen: { type: "loading" }, stack: [...stack, screen] };
      return { screen: { type: "loading" }, stack: [] };
    case "RESOLVE_SUCCESS":
      return { screen: { type: "result", active: action.active }, stack };
    case "DISAMBIGUATION":
      return { screen: { type: "disambiguation", candidates: action.candidates }, stack };
    case "SELECT_CANDIDATE":
      if (screen.type === "disambiguation")
        return {
          screen: { type: "disambiguation_loading", candidates: screen.candidates, selectedId: action.selectedId },
          stack,
        };
      return { screen, stack };
    case "GENRE_BROWSE":
      return { screen: { type: "genre-browse", genres: action.genres }, stack };
    case "GENRE_SEARCH":
      return { screen: { type: "genre-search", payload: action.payload }, stack };
    case "SELECT_GENRE_RESULT":
      if (screen.type === "genre-search")
        return {
          screen: { type: "genre-search_loading", payload: screen.payload, selectedId: action.selectedId },
          stack: [...stack, screen],
        };
      return { screen, stack };
    case "NAV_BACK": {
      if (stack.length === 0) return { screen, stack };
      const restored = stack[stack.length - 1];
      return { screen: restored, stack: stack.slice(0, -1) };
    }
    case "ERROR":
      return { screen: { type: "error", message: action.message }, stack: [] };
    case "CLEAR_START":
      if (screen.type === "result") return { screen: { type: "clearing", active: screen.active }, stack: [] };
      return { screen: { type: "idle" }, stack: [] };
    case "CLEAR":
      return { screen: { type: "idle" }, stack: [] };
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
