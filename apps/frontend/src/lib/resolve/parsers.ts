import type {
  AlbumResolveSuccessResponse,
  ApiCcTrack,
  ArtistResolveSuccessResponse,
  CcAlbumResolveSuccessResponse,
  CcArtistResolveSuccessResponse,
  CcResolveSuccessResponse,
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
  AppStateType,
  type ArtistResult,
  CC_TRACK_CANDIDATE_PREFIX,
  type CcAlbumResult,
  type CcArtistResult,
  type CcEntityTrack,
  type CcTrackResult,
  type ReducerState,
  type ResolveUiError,
  type SongResult,
} from "@/lib/types/app";
import {
  type AlbumContentConfiguration,
  type ArtistContentConfiguration,
  type CcTrackContentConfiguration,
  MediaCardContentTypeValue,
  type ShareContentConfiguration,
  type SongContentConfiguration,
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
    case "RESOLVE_CC_SUCCESS":
      return { screen: { type: AppStateType.CcResult, ccActive: action.ccActive }, stack };
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

/**
 * Maps a {@link CcResolveSuccessResponse} wire payload to a {@link CcTrackResult}
 * for use in the app state.
 *
 * Does **not** call `apiLinksToPlatformLinks` — CC tracks have no cross-service
 * links. `jamendoUrl` is sourced from the track's own `shareUrl` field (the
 * canonical Jamendo page); `shareUrl` is the musiccloud short URL from the
 * response envelope.
 *
 * @param data - The raw CC resolve success payload from the backend.
 * @returns A fully mapped `CcTrackResult` ready to be stored in app state.
 */
export function parseCcResolveResponse(data: CcResolveSuccessResponse): CcTrackResult {
  return {
    kind: ActiveResultKind.CcSong,
    jamendoId: data.track.jamendoId,
    title: data.track.title,
    artist: data.track.artistName,
    album: data.track.albumName,
    releaseDate: data.track.releaseDate,
    durationMs: data.track.durationMs,
    artworkUrl: data.track.artworkUrl ?? "",
    streamUrl: data.track.streamUrl,
    licenseCcurl: data.track.licenseCcurl,
    downloadUrl: data.track.downloadUrl,
    downloadAllowed: data.track.downloadAllowed,
    waveform: data.track.waveform,
    jamendoUrl: data.track.shareUrl,
    shareUrl: data.shortUrl,
  };
}

/**
 * Maps a wire CC track (carried inside an album/artist payload) to a
 * {@link CcEntityTrack} row, prebuilding the `jamendo:<id>` click-through
 * candidate id so a row click resolves straight to the CC track page.
 *
 * @param track - A CC track from an album's `tracks` / artist's `topTracks`.
 * @returns The track row for the album/artist view.
 */
function toCcEntityTrack(track: ApiCcTrack): CcEntityTrack {
  return {
    candidateId: `${CC_TRACK_CANDIDATE_PREFIX}${track.jamendoId}`,
    title: track.title,
    artist: track.artistName,
    durationMs: track.durationMs,
    artworkUrl: track.artworkUrl ?? "",
  };
}

/**
 * Maps a {@link CcAlbumResolveSuccessResponse} to a {@link CcAlbumResult} for the
 * app state. The album's tracks travel live (not persisted) and become clickable
 * {@link CcEntityTrack} rows; `jamendoUrl` is the album's own Jamendo page and
 * `shareUrl` is the musiccloud short URL from the response envelope.
 *
 * @param data - The raw CC album resolve success payload.
 * @returns A fully mapped `CcAlbumResult`.
 */
export function parseCcAlbumResolveResponse(data: CcAlbumResolveSuccessResponse): CcAlbumResult {
  return {
    kind: ActiveResultKind.CcAlbum,
    jamendoId: data.album.jamendoId,
    title: data.album.name,
    artist: data.album.artistName,
    releaseDate: data.album.releaseDate,
    artworkUrl: data.album.artworkUrl ?? "",
    jamendoUrl: data.album.shareUrl,
    shareUrl: data.shortUrl,
    tracks: data.album.tracks.map(toCcEntityTrack),
  };
}

/**
 * Maps a {@link CcArtistResolveSuccessResponse} to a {@link CcArtistResult} for
 * the app state. The artist's top tracks travel live (not persisted) and become
 * clickable {@link CcEntityTrack} rows.
 *
 * @param data - The raw CC artist resolve success payload.
 * @returns A fully mapped `CcArtistResult`.
 */
export function parseCcArtistResolveResponse(data: CcArtistResolveSuccessResponse): CcArtistResult {
  return {
    kind: ActiveResultKind.CcArtist,
    jamendoId: data.artist.jamendoId,
    name: data.artist.name,
    imageUrl: data.artist.imageUrl ?? "",
    jamendoUrl: data.artist.shareUrl,
    shareUrl: data.shortUrl,
    topTracks: data.artist.topTracks.map(toCcEntityTrack),
  };
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

/**
 * Builds a {@link CcTrackContentConfiguration} from a resolved CC track result.
 *
 * Mirrors the song branch of {@link buildShareConfigFromActive} but omits
 * `platforms` / `platformsLabel` (CC tracks have no cross-service links) and
 * fills the CC-specific fields (`streamUrl`, `licenseCcurl`, `attribution`,
 * `downloadUrl`, `downloadAllowed`, `jamendoUrl`, `waveform`).
 *
 * The `attribution` field is kept simple (artist name only) to stay KISS. If a
 * license hint is needed downstream, callers can derive it from `licenseCcurl`.
 *
 * @param cc - The resolved CC track from app state.
 * @param t - Translation function for pre-computed UI strings.
 * @returns A fully populated `CcTrackContentConfiguration`.
 */
export function buildCcShareConfig(cc: CcTrackResult, t: TFunc): CcTrackContentConfiguration {
  const shortId = shortIdFromShortUrl(cc.shareUrl);
  return {
    type: "cc-track",
    title: cc.title,
    artist: cc.artist,
    album: cc.album,
    artworkUrl: cc.artworkUrl,
    metaLine: buildMetaLine({ durationMs: cc.durationMs, releaseDate: cc.releaseDate }) || undefined,
    srAnnouncement: t("results.found", { title: cc.title, artist: cc.artist }),
    shortUrl: cc.shareUrl,
    shortId,
    streamUrl: cc.streamUrl,
    licenseCcurl: cc.licenseCcurl,
    attribution: cc.artist,
    downloadUrl: cc.downloadUrl,
    downloadAllowed: cc.downloadAllowed,
    jamendoUrl: cc.jamendoUrl,
    waveform: cc.waveform,
  };
}

/**
 * Builds the {@link MediaSummaryCard}-compatible header config for a CC entity
 * (album or artist), reusing the same `type: "share"` shape the commercial media
 * card uses: empty platform fields (CC has no cross-service links) and the
 * musiccloud short URL for the share button. No `previewUrl` — an album/artist has
 * no single stream, so the summary card renders cover + info + share without a
 * player. The CC track card's `ccSummaryConfig` builds on this base too (DRY).
 *
 * @param opts.title - Header primary line (album title or artist name).
 * @param opts.artist - Header secondary line (album artist; empty for an artist).
 * @param opts.artworkUrl - Cover / avatar URL.
 * @param opts.metaLine - Optional pre-built meta line.
 * @param opts.shortUrl - musiccloud short URL backing the share button.
 * @returns The share-content configuration for the entity header.
 */
export function buildCcEntityHeaderConfig(opts: {
  title: string;
  artist: string;
  artworkUrl: string;
  metaLine?: string;
  shortUrl: string;
}): ShareContentConfiguration {
  return {
    type: MediaCardContentTypeValue.Share,
    title: opts.title,
    artist: opts.artist,
    artworkUrl: opts.artworkUrl,
    metaLine: opts.metaLine,
    platforms: [],
    platformsLabel: "",
    platformsLabelKey: "",
    shortUrl: opts.shortUrl,
  };
}
