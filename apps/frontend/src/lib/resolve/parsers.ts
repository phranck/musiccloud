import type {
  AlbumResolveSuccessResponse,
  ArtistResolveSuccessResponse,
  CcAlbumResolveSuccessResponse,
  CcAlbumSharePageResponse,
  CcArtistResolveSuccessResponse,
  CcArtistSharePageResponse,
  CcResolveSuccessResponse,
  CcTrackSharePageResponse,
  ResolveSuccessResponse,
  UnifiedResolveSuccessResponse,
} from "@musiccloud/shared";
import { buildMetaLine, ENDPOINTS, PLATFORM_CONFIG } from "@musiccloud/shared";
import { catalogTextFromIds, labelAlbumTitleFrom, releaseYearFromDate } from "@/lib/media/lp-label";
import { apiLinksToPlatformLinks } from "@/lib/platform/api-links";
import { pathFromShortUrl } from "@/lib/share/short-url";
import {
  type ActiveResult,
  ActiveResultKind,
  type AlbumResult,
  type AppAction,
  AppStateType,
  type ArtistResult,
  type CcAlbumResult,
  type CcArtistResult,
  type CcResult,
  CcResultType,
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
  MediaKindValue,
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
function parseCcResolveResponse(data: CcResolveSuccessResponse): CcTrackResult {
  return {
    kind: ActiveResultKind.CcSong,
    jamendoId: data.track.jamendoId,
    jamendoArtistId: data.track.jamendoArtistId,
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
    musicInfo: data.track.musicInfo,
    stats: data.track.stats,
    proLicensing: data.track.proLicensing,
    proUrl: data.track.proUrl,
  };
}

/**
 * Maps a {@link CcAlbumResolveSuccessResponse} to a {@link CcAlbumResult} for the
 * app state. `artistInfo` (the album's tracks + similar tracks, built by the
 * backend) drives the shared artist column; `jamendoUrl` is the album's Jamendo
 * page and `shareUrl` is the musiccloud short URL.
 *
 * @param data - The raw CC album resolve success payload.
 * @returns A fully mapped `CcAlbumResult`.
 */
function parseCcAlbumResolveResponse(data: CcAlbumResolveSuccessResponse): CcAlbumResult {
  return {
    kind: ActiveResultKind.CcAlbum,
    jamendoId: data.album.jamendoId,
    title: data.album.name,
    artist: data.album.artistName,
    releaseDate: data.album.releaseDate,
    artworkUrl: data.album.artworkUrl ?? "",
    jamendoUrl: data.album.shareUrl,
    shareUrl: data.shortUrl,
    artistInfo: data.artistInfo,
  };
}

/**
 * Maps a {@link CcArtistResolveSuccessResponse} to a {@link CcArtistResult} for
 * the app state. `artistInfo` (the artist's top tracks + similar tracks) drives
 * the shared artist column.
 *
 * @param data - The raw CC artist resolve success payload.
 * @returns A fully mapped `CcArtistResult`.
 */
function parseCcArtistResolveResponse(data: CcArtistResolveSuccessResponse): CcArtistResult {
  return {
    kind: ActiveResultKind.CcArtist,
    jamendoId: data.artist.jamendoId,
    name: data.artist.name,
    imageUrl: data.artist.imageUrl ?? "",
    jamendoUrl: data.artist.shareUrl,
    shareUrl: data.shortUrl,
    artistInfo: data.artistInfo,
  };
}

/** The three CC resolve success shapes the CC endpoint returns for a query or candidate. */
export type CcResolveData = CcResolveSuccessResponse | CcAlbumResolveSuccessResponse | CcArtistResolveSuccessResponse;

/**
 * Maps a CC resolve success payload to its app-state {@link CcResult}, picking the
 * parser by the `cc-track` / `cc-album` / `cc-artist` discriminant.
 *
 * The single home for the type-to-parser mapping, shared by every CC resolve
 * path (the landing-state dispatch and the in-place `ccTrackResolver`).
 *
 * @param data - A CC resolve success payload (track, album, or artist).
 * @returns The equivalent {@link CcResult}.
 */
export function ccResolveDataToResult(data: CcResolveData): CcResult {
  if (data.type === CcResultType.CcAlbum) return parseCcAlbumResolveResponse(data);
  if (data.type === CcResultType.CcArtist) return parseCcArtistResolveResponse(data);
  return parseCcResolveResponse(data);
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
      labelAlbumTitle: labelAlbumTitleFrom(active.album, active.title),
      labelReleaseYear: releaseYearFromDate(active.releaseDate),
      labelCatalogText: catalogTextFromIds({ isrc: active.isrc }),
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
      labelAlbumTitle: active.name,
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
    labelAlbumTitle: active.title,
    labelReleaseYear: year,
    labelCatalogText: catalogTextFromIds({ label: active.label, upc: active.upc }),
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
      labelAlbumTitle: active.name,
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
      labelAlbumTitle: active.title,
      labelReleaseYear: year,
      labelCatalogText: catalogTextFromIds({ label: active.label, upc: active.upc }),
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
    labelAlbumTitle: labelAlbumTitleFrom(active.album, active.title),
    labelReleaseYear: releaseYearFromDate(active.releaseDate),
    labelCatalogText: catalogTextFromIds({ isrc: active.isrc }),
    platforms: active.platforms,
    platformsLabel: t(platformsLabelKey),
    platformsLabelKey,
    platformsInfo,
    shortUrl: active.shareUrl,
    shortId,
  };
}

/** Human-readable label for a Creative Commons clause segment (`by`, `nc`, …). */
const CC_CLAUSE_LABELS: Record<string, string> = {
  by: "BY",
  nc: "NC",
  nd: "ND",
  sa: "SA",
  zero: "0",
};

/**
 * The two path roots a Creative Commons deed URL can start with.
 *
 * Stored as a domain-literal namespace (not inline string comparisons) so the
 * `kind` discriminant in {@link ccLicenseLabel} compares against a single source
 * of truth, satisfying the domain-literals Doctor rule.
 */
const CcDeedKind = {
  Licenses: "licenses",
  PublicDomain: "publicdomain",
} as const;

/**
 * Derives a display label such as `CC BY-NC-ND 3.0` from a canonical Creative
 * Commons deed URL.
 *
 * The Jamendo `licenseCcurl` follows the shape
 * `https://creativecommons.org/licenses/<clauses>/<version>/`, where `<clauses>`
 * is a dash-separated list (`by`, `by-nc-nd`, …) and `<version>` is the licence
 * version (`3.0`, `4.0`). Public-domain dedications use the `publicdomain/zero`
 * path. We keep this intentionally small (KISS): unknown clause tokens are
 * upper-cased verbatim so any future CC variant still renders something useful.
 *
 * @param url - The canonical CC deed URL, or `undefined` when Jamendo omits it.
 * @returns A short licence label (e.g. `CC BY 4.0`), or `undefined` when the URL
 *   is missing or cannot be parsed into the expected `/licenses|publicdomain/…`
 *   shape.
 */
function ccLicenseLabel(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    // Expected: ["licenses", "<clauses>", "<version>"] or
    //           ["publicdomain", "zero", "<version>"].
    const kind = segments[0];
    if (kind !== CcDeedKind.Licenses && kind !== CcDeedKind.PublicDomain) return undefined;
    const clauses = segments[1];
    const version = segments[2];
    if (!clauses) return undefined;
    const clauseLabel = clauses
      .split("-")
      .map((clause) => CC_CLAUSE_LABELS[clause] ?? clause.toUpperCase())
      .join("-");
    return ["CC", clauseLabel, version].filter(Boolean).join(" ");
  } catch {
    return undefined;
  }
}

/**
 * Builds a {@link CcTrackContentConfiguration} from a resolved CC track result.
 *
 * Mirrors the song branch of {@link buildShareConfigFromActive} but omits
 * `platforms` / `platformsLabel` (CC tracks have no cross-service links) and
 * fills the CC-specific fields (`streamUrl`, `licenseCcurl`, `licenseLabel`,
 * `attribution`, `downloadUrl`, `downloadAllowed`, `jamendoUrl`, `waveform`).
 *
 * The `attribution` field is kept simple (artist name only) to stay KISS. The
 * `licenseLabel` is parsed here from `licenseCcurl` via {@link ccLicenseLabel}
 * so the presentational `CcInfoCard` consumes a ready label; `licenseCcurl`
 * stays in the config for the deed link and as the verbatim fallback.
 *
 * @param cc - The resolved CC track from app state.
 * @param t - Translation function for pre-computed UI strings.
 * @returns A fully populated `CcTrackContentConfiguration`.
 */
function buildCcShareConfig(cc: CcTrackResult, t: TFunc): CcTrackContentConfiguration {
  const shortId = shortIdFromShortUrl(cc.shareUrl);
  return {
    type: "cc-track",
    title: cc.title,
    artist: cc.artist,
    album: cc.album,
    artworkUrl: cc.artworkUrl,
    metaLine: buildMetaLine({ durationMs: cc.durationMs, releaseDate: cc.releaseDate }) || undefined,
    labelAlbumTitle: labelAlbumTitleFrom(cc.album, cc.title),
    labelReleaseYear: releaseYearFromDate(cc.releaseDate),
    // CC tracks are GEMA-free: show the licence in the top-left rights field
    // (replacing "GEMA") and leave the center catalog field empty (no ISRC).
    labelRightsText: ccLicenseLabel(cc.licenseCcurl),
    srAnnouncement: t("results.found", { title: cc.title, artist: cc.artist }),
    shortUrl: cc.shareUrl,
    shortId,
    streamUrl: cc.streamUrl,
    licenseCcurl: cc.licenseCcurl,
    licenseLabel: ccLicenseLabel(cc.licenseCcurl),
    attribution: cc.artist,
    downloadUrl: cc.downloadUrl,
    downloadAllowed: cc.downloadAllowed,
    jamendoUrl: cc.jamendoUrl,
    artistJamendoUrl: jamendoArtistProfileUrl(cc.jamendoArtistId),
    waveform: cc.waveform,
    musicInfo: cc.musicInfo,
    stats: cc.stats,
    proLicensing: cc.proLicensing,
    proUrl: cc.proUrl,
    jamendoTrackId: cc.jamendoId,
  };
}

/**
 * Builds the Jamendo artist-profile URL from a Jamendo artist id. The numeric-id
 * form `https://www.jamendo.com/artist/<id>` resolves to the artist's public
 * profile page (verified against Jamendo), so no name slug is needed.
 *
 * @param jamendoArtistId - The Jamendo artist id, or undefined.
 * @returns The profile URL, or undefined when no id is present.
 */
function jamendoArtistProfileUrl(jamendoArtistId: string | undefined): string | undefined {
  return jamendoArtistId ? `https://www.jamendo.com/artist/${jamendoArtistId}` : undefined;
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
function buildCcEntityHeaderConfig(opts: {
  title: string;
  artist: string;
  artworkUrl: string;
  metaLine?: string;
  labelAlbumTitle?: string;
  labelReleaseYear?: string;
  labelCatalogText?: string;
  labelRightsText?: string;
  shortUrl: string;
}): ShareContentConfiguration {
  return {
    type: MediaCardContentTypeValue.Share,
    title: opts.title,
    artist: opts.artist,
    artworkUrl: opts.artworkUrl,
    metaLine: opts.metaLine,
    labelAlbumTitle: opts.labelAlbumTitle,
    labelReleaseYear: opts.labelReleaseYear,
    labelCatalogText: opts.labelCatalogText,
    labelRightsText: opts.labelRightsText,
    platforms: [],
    platformsLabel: "",
    platformsLabelKey: "",
    shortUrl: opts.shortUrl,
  };
}

/**
 * Builds the {@link MediaSummaryCard} config for a resolved CC track: the shared
 * entity header plus the full-stream player (`previewUrl = streamUrl`) and album
 * line. The audio player seeds a placeholder duration and overrides it from the
 * real stream, so passing the full stream URL plays the whole track. Used as
 * `ShareLayout.config` for the CC track page (the CC license/attribution lives in
 * the separate `CcInfoCard` secondary slot).
 *
 * @param cc - The resolved CC track from app state.
 * @returns The share-content configuration for the track's left media card.
 */
function ccTrackToShareConfig(cc: CcTrackResult): ShareContentConfiguration {
  return {
    ...buildCcEntityHeaderConfig({
      title: cc.title,
      artist: cc.artist,
      artworkUrl: cc.artworkUrl,
      metaLine: buildMetaLine({ durationMs: cc.durationMs, releaseDate: cc.releaseDate }) || undefined,
      labelAlbumTitle: labelAlbumTitleFrom(cc.album, cc.title),
      labelReleaseYear: releaseYearFromDate(cc.releaseDate),
      // GEMA-free: licence goes in the top-left rights field; center stays empty.
      labelRightsText: ccLicenseLabel(cc.licenseCcurl),
      shortUrl: cc.shareUrl,
    }),
    album: cc.album,
    // CC audio is streamed through our same-origin proxy, not Jamendo directly:
    // Jamendo omits the Range CORS headers the crossorigin player needs. The
    // proxy defaults to mp32 (256k) when no format query is present.
    previewUrl: ENDPOINTS.frontend.ccAudio(cc.jamendoId),
    mediaKind: MediaKindValue.Song,
    ccJamendoArtistId: cc.jamendoArtistId,
    shortId: shortIdFromShortUrl(cc.shareUrl),
  };
}

/**
 * The per-kind {@link ShareLayout} inputs for a resolved Creative-Commons entity.
 *
 * The left media card is always a {@link ShareContentConfiguration}; for a CC
 * track its `ccInfoContent` carries the license / attribution block rendered as
 * the `CcInfoCard` secondary. Album/artist omit it — the default `ServicesCard`
 * self-hides on the CC config's empty platforms.
 *
 * @property config - The media-card configuration for the left column (a CC
 *   track's config additionally carries `ccInfoContent` / `ccJamendoArtistId`).
 * @property artistName - The artist name used to drive the shared artist column.
 */
export interface CcResultShareProps {
  config: ShareContentConfiguration;
  artistName: string;
}

/**
 * Maps a resolved CC entity (track, album or artist) to the per-kind
 * {@link ShareLayout} inputs.
 *
 * Owns the `kind` branching that used to live inline in the landing page: album
 * and artist build a {@link buildCcEntityHeaderConfig} header; a track builds its
 * {@link ccTrackToShareConfig} player config with the {@link buildCcShareConfig}
 * license block folded into `config.ccInfoContent`, so the secondary card follows
 * the config through an in-place resolve.
 *
 * @param ccActive - The resolved CC entity from app state.
 * @param t - Translation function (forwarded to {@link buildCcShareConfig}).
 * @returns The `config` and `artistName` for ShareLayout.
 */
export function ccResultToShareProps(ccActive: CcResult, t: TFunc): CcResultShareProps {
  if (ccActive.kind === ActiveResultKind.CcAlbum) {
    return {
      config: buildCcEntityHeaderConfig({
        title: ccActive.title,
        artist: ccActive.artist,
        artworkUrl: ccActive.artworkUrl,
        metaLine: ccActive.releaseDate?.slice(0, 4),
        labelAlbumTitle: ccActive.title,
        labelReleaseYear: releaseYearFromDate(ccActive.releaseDate),
        shortUrl: ccActive.shareUrl,
      }),
      artistName: ccActive.artist,
    };
  }
  if (ccActive.kind === ActiveResultKind.CcArtist) {
    return {
      config: buildCcEntityHeaderConfig({
        title: ccActive.name,
        artist: "",
        artworkUrl: ccActive.imageUrl,
        labelAlbumTitle: ccActive.name,
        shortUrl: ccActive.shareUrl,
      }),
      artistName: ccActive.name,
    };
  }
  return {
    config: { ...ccTrackToShareConfig(ccActive), ccInfoContent: buildCcShareConfig(ccActive, t) },
    artistName: ccActive.artist,
  };
}

/**
 * Adapts a CC share-page wire response into the app-state {@link CcResult} shape.
 *
 * The persistent share page receives the same CC entity the live resolve emits,
 * just under the wire field names (`artistName`/`albumName`/`shareUrl` vs. the
 * app-state `artist`/`album`/`jamendoUrl`, and the top-level `shortUrl` as the
 * musiccloud short URL). Mapping here lets the share page reuse
 * {@link ccResultToShareProps} verbatim instead of duplicating the per-kind
 * config builders.
 *
 * @param data - A `cc-track` / `cc-album` / `cc-artist` share-page response.
 * @returns The equivalent {@link CcResult} for {@link ccResultToShareProps}.
 */
export function ccResponseToResult(
  data: CcTrackSharePageResponse | CcAlbumSharePageResponse | CcArtistSharePageResponse,
): CcResult {
  if (data.type === "cc-track") {
    const track = data.track;
    return {
      kind: ActiveResultKind.CcSong,
      jamendoId: track.jamendoId,
      jamendoArtistId: track.jamendoArtistId,
      title: track.title,
      artist: track.artistName,
      album: track.albumName,
      releaseDate: track.releaseDate,
      durationMs: track.durationMs,
      artworkUrl: track.artworkUrl ?? "",
      streamUrl: track.streamUrl,
      licenseCcurl: track.licenseCcurl,
      downloadUrl: track.downloadUrl,
      downloadAllowed: track.downloadAllowed,
      waveform: track.waveform,
      jamendoUrl: track.shareUrl,
      shareUrl: data.shortUrl,
      musicInfo: track.musicInfo,
      stats: track.stats,
      proLicensing: track.proLicensing,
      proUrl: track.proUrl,
    };
  }
  if (data.type === "cc-album") {
    const album = data.album;
    return {
      kind: ActiveResultKind.CcAlbum,
      jamendoId: album.jamendoId,
      title: album.name,
      artist: album.artistName,
      releaseDate: album.releaseDate,
      artworkUrl: album.artworkUrl ?? "",
      jamendoUrl: album.shareUrl,
      shareUrl: data.shortUrl,
      artistInfo: data.artistInfo,
    };
  }
  const artist = data.artist;
  return {
    kind: ActiveResultKind.CcArtist,
    jamendoId: artist.jamendoId,
    name: artist.name,
    imageUrl: artist.imageUrl ?? "",
    jamendoUrl: artist.shareUrl,
    shareUrl: data.shortUrl,
    artistInfo: data.artistInfo,
  };
}
