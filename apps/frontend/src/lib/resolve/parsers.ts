import type {
  AlbumResolveSuccessResponse,
  ArtistResolveSuccessResponse,
  ResolveSuccessResponse,
  UnifiedResolveSuccessResponse,
} from "@musiccloud/shared";
import { buildMetaLine, PLATFORM_CONFIG } from "@musiccloud/shared";
import { apiLinksToPlatformLinks } from "@/lib/platform/api-links";
import {
  type ActiveResult,
  ActiveResultKind,
  type AlbumResult,
  type AppAction,
  type ArtistResult,
  type ReducerState,
  type ResolveUiError,
  type SongResult,
} from "@/lib/types/app";
import type {
  AlbumContentConfiguration,
  ArtistContentConfiguration,
  ShareContentConfiguration,
  SongContentConfiguration,
} from "@/lib/types/media-card";
import type { PlatformLink } from "@/lib/types/platform";

// ---------------------------------------------------------------------------
// App state reducer
// ---------------------------------------------------------------------------

export function appReducer({ screen, stack }: ReducerState, action: AppAction): ReducerState {
  switch (action.type) {
    case "SUBMIT": {
      const compact = screen.type !== "idle" && screen.type !== "error";
      const loadingScreen = { type: "loading" as const, compact };
      // Navigating from genre-browse preserves the browse state for back-navigation.
      // Any other submission starts a fresh journey (stack cleared).
      if (screen.type === "genre-browse") return { screen: loadingScreen, stack: [...stack, screen] };
      return { screen: loadingScreen, stack: [] };
    }
    case "RESOLVE_SUCCESS":
      return { screen: { type: "result", active: action.active, resolved: action.resolved }, stack };
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
      return { screen: { type: "error", error: action.error }, stack: [] };
    case "CLEAR_START":
      if (screen.type === "result")
        return { screen: { type: "clearing", active: screen.active, resolved: screen.resolved }, stack: [] };
      return { screen: { type: "idle" }, stack: [] };
    case "CLEAR":
      return { screen: { type: "idle" }, stack: [] };
    // Placeholder: full implementation in Task 4 (parsers + CcTrackResult import).
    case "RESOLVE_CC_SUCCESS":
      return { screen, stack };
  }
}

// ---------------------------------------------------------------------------
// Response parsers
// ---------------------------------------------------------------------------

export function parseResolveResponse(data: ResolveSuccessResponse): SongResult {
  const platforms = apiLinksToPlatformLinks(data.links);
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

function parseAlbumResolveResponse(data: AlbumResolveSuccessResponse): AlbumResult {
  const platforms = apiLinksToPlatformLinks(data.links);
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

function parseArtistResolveResponse(data: ArtistResolveSuccessResponse): ArtistResult {
  const platforms = apiLinksToPlatformLinks(data.links);
  return {
    kind: "artist",
    name: data.artist.name,
    imageUrl: data.artist.imageUrl ?? "",
    genres: data.artist.genres,
    platforms,
    shareUrl: data.shortUrl,
  };
}

export function parseUnifiedResolveResponse(data: UnifiedResolveSuccessResponse): ActiveResult {
  if (data.type === "artist") return parseArtistResolveResponse(data);
  if (data.type === "album") return parseAlbumResolveResponse(data);
  return parseResolveResponse(data);
}

export class ResolveApiError extends Error {
  readonly code: string;
  readonly context?: Record<string, string>;

  constructor(payload: { error?: string; message?: string; context?: Record<string, string | number> }) {
    super(payload.message || payload.error || "Resolve request failed");
    this.name = "ResolveApiError";
    this.code = payload.error || "error.generic";
    this.context = payload.context
      ? Object.fromEntries(Object.entries(payload.context).map(([key, value]) => [key, String(value)]))
      : undefined;
  }
}

export function parseResolveError(err: unknown): ResolveUiError {
  if (err instanceof TypeError && err.message.includes("Failed to fetch")) return { key: "error.offline" };
  if (err instanceof Error && err.name === "AbortError") return { key: "error.timeout" };
  if (err instanceof ResolveApiError) {
    return {
      key: `errorCodes.${err.code}`,
      code: err.code,
      context: err.context,
    };
  }
  if (err instanceof Error && err.message.startsWith("error.")) return { key: err.message };
  return { key: "error.generic" };
}

export function formatResolveErrorMessage(
  t: (key: string, vars?: Record<string, string>) => string,
  error: ResolveUiError,
): string {
  const vars = { ...(error.context ?? {}), ...(error.code ? { code: error.code } : {}) };
  const localized = t(error.key, vars);
  if (localized !== error.key) return localized;
  if (error.code) return t("error.genericWithCode", { code: error.code });
  return t("error.generic");
}

// ---------------------------------------------------------------------------
// Display configuration builders
// ---------------------------------------------------------------------------

type TFunc = (key: string, vars?: Record<string, string>) => string;

function shortIdFromShortUrl(shortUrl: string): string | undefined {
  try {
    const shortId = new URL(shortUrl, "https://musiccloud.io").pathname.replace(/^\/+/, "").split("/")[0];
    return shortId || undefined;
  } catch {
    return undefined;
  }
}

function getPlatformsInfo(platforms: PlatformLink[], t: TFunc): string | undefined {
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
): SongContentConfiguration | AlbumContentConfiguration | ArtistContentConfiguration {
  // CcTrackResult has no platforms — it is rendered via buildCcShareConfig (Task 4).
  // This guard keeps the union exhaustive; callers must not pass a CcTrackResult here.
  if (active.kind === ActiveResultKind.CcSong) {
    throw new Error("buildActiveConfig does not handle CcTrackResult — use buildCcShareConfig");
  }
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
  };
}

export function buildShareConfigFromActive(active: ActiveResult, t: TFunc): ShareContentConfiguration {
  // CcTrackResult has no platforms — it is rendered via buildCcShareConfig (Task 4).
  // This guard keeps the union exhaustive; callers must not pass a CcTrackResult here.
  if (active.kind === ActiveResultKind.CcSong) {
    throw new Error("buildShareConfigFromActive does not handle CcTrackResult — use buildCcShareConfig");
  }
  const platformsInfo = getPlatformsInfo(active.platforms, t);
  const shortId = shortIdFromShortUrl(active.shareUrl);

  if (active.kind === "artist") {
    const platformsLabelKey = "results.viewArtistOn";
    return {
      type: "share",
      title: active.name,
      artist: "",
      artworkUrl: active.imageUrl,
      metaLine: active.genres?.join(", ") || undefined,
      platforms: active.platforms,
      platformsLabel: t(platformsLabelKey),
      platformsLabelKey,
      platformsInfo,
      shortUrl: active.shareUrl,
      shortId,
    };
  }

  if (active.kind === "album") {
    const platformsLabelKey = "results.openAlbumOn";
    const year = active.releaseDate?.slice(0, 4);
    const metaParts = [
      active.totalTracks ? t("results.albumTracks", { count: String(active.totalTracks) }) : null,
      year,
    ].filter(Boolean) as string[];

    return {
      type: "share",
      title: active.title,
      artist: active.artist,
      artworkUrl: active.artworkUrl,
      previewUrl: active.previewUrl,
      metaLine: metaParts.join(" \u00B7") || undefined,
      platforms: active.platforms,
      platformsLabel: t(platformsLabelKey),
      platformsLabelKey,
      platformsInfo,
      shortUrl: active.shareUrl,
      shortId,
    };
  }

  const platformsLabelKey = "results.listenOn";
  return {
    type: "share",
    title: active.title,
    artist: active.artist,
    album: active.album,
    artworkUrl: active.artworkUrl,
    isExplicit: active.isExplicit,
    previewUrl: active.previewUrl,
    metaLine: buildMetaLine({ durationMs: active.durationMs, releaseDate: active.releaseDate }) || undefined,
    platforms: active.platforms,
    platformsLabel: t(platformsLabelKey),
    platformsLabelKey,
    platformsInfo,
    shortUrl: active.shareUrl,
    shortId,
  };
}
