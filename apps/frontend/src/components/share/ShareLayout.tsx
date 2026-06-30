/**
 * ShareLayout
 *
 * Desktop/tablet: split media, actions, services, and artist data cards,
 *                 horizontally centered. Artist data is fetched immediately.
 *
 * Mobile: SharePageCard only, with a button that opens ArtistInfoCard
 *         as a bottom sheet.
 */

import type { ArtistInfoResponse, ArtistTopTrack } from "@musiccloud/shared";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { createPortal } from "react-dom";

const ShareUiActionType = {
  ArtistFetchFinished: "artistFetchFinished",
  ArtistReadyHidden: "artistReadyHidden",
  ArtistReadyVisible: "artistReadyVisible",
  CloseSheet: "closeSheet",
  MediaViewRestored: "mediaViewRestored",
  MediaViewToggled: "mediaViewToggled",
  OpenSheet: "openSheet",
  PreviewStatusChanged: "previewStatusChanged",
  PropsChanged: "propsChanged",
  ResolveErrorHidden: "resolveErrorHidden",
  ResolveErrorVisible: "resolveErrorVisible",
  ResolveStarted: "resolveStarted",
  Resolved: "resolved",
} as const;

interface ShareUiState {
  artistReadyVisible: boolean;
  currentArtistContext: ArtistInfoContext;
  currentArtistName: string;
  currentConfig: MediaCardContentConfiguration;
  lastPropsConfigKey: string;
  previewStatus: AudioStatus | null;
  resolveErrorVisible: boolean;
  resolveTriggeredArtistLoad: boolean;
  shareMediaView: ShareMediaViewType;
  sheetOpen: boolean;
}
type ShareUiAction =
  | { type: typeof ShareUiActionType.ArtistFetchFinished }
  | { type: typeof ShareUiActionType.ArtistReadyHidden }
  | { type: typeof ShareUiActionType.ArtistReadyVisible }
  | { type: typeof ShareUiActionType.CloseSheet }
  | { type: typeof ShareUiActionType.MediaViewRestored; view: ShareMediaViewType }
  | { type: typeof ShareUiActionType.MediaViewToggled }
  | { type: typeof ShareUiActionType.OpenSheet }
  | { type: typeof ShareUiActionType.PreviewStatusChanged; status: AudioStatus | null }
  | {
      type: typeof ShareUiActionType.PropsChanged;
      artistContext: ArtistInfoContext;
      artistName: string;
      config: MediaCardContentConfiguration;
      configKey: string;
    }
  | { type: typeof ShareUiActionType.ResolveErrorHidden }
  | { type: typeof ShareUiActionType.ResolveErrorVisible }
  | { type: typeof ShareUiActionType.ResolveStarted }
  | {
      type: typeof ShareUiActionType.Resolved;
      artistContext?: ArtistInfoContext;
      artistName?: string;
      config: MediaCardContentConfiguration;
    };

function shareUiReducer(state: ShareUiState, action: ShareUiAction): ShareUiState {
  switch (action.type) {
    case ShareUiActionType.ArtistFetchFinished:
      return { ...state, resolveTriggeredArtistLoad: false };
    case ShareUiActionType.ArtistReadyHidden:
      return { ...state, artistReadyVisible: false };
    case ShareUiActionType.ArtistReadyVisible:
      return { ...state, artistReadyVisible: true };
    case ShareUiActionType.CloseSheet:
      return { ...state, sheetOpen: false };
    case ShareUiActionType.MediaViewRestored:
      return { ...state, shareMediaView: action.view };
    case ShareUiActionType.MediaViewToggled:
      return { ...state, shareMediaView: nextShareMediaView(state.shareMediaView) };
    case ShareUiActionType.OpenSheet:
      return { ...state, sheetOpen: true };
    case ShareUiActionType.PreviewStatusChanged:
      return { ...state, previewStatus: action.status };
    case ShareUiActionType.PropsChanged:
      if (state.lastPropsConfigKey === action.configKey) return state;
      return {
        ...state,
        currentArtistContext: action.artistContext,
        currentArtistName: action.artistName,
        currentConfig: action.config,
        lastPropsConfigKey: action.configKey,
        // A new entity re-keys (and re-mounts) the audio hub; it reports no
        // status on mount, so a stale `playing` would otherwise stick. A stale
        // resolve error from the previous entity is likewise no longer relevant.
        previewStatus: null,
        resolveErrorVisible: false,
      };
    case ShareUiActionType.ResolveErrorHidden:
      return { ...state, resolveErrorVisible: false };
    case ShareUiActionType.ResolveErrorVisible:
      return { ...state, resolveErrorVisible: true };
    case ShareUiActionType.ResolveStarted:
      return { ...state, resolveErrorVisible: false, resolveTriggeredArtistLoad: true };
    case ShareUiActionType.Resolved:
      return {
        ...state,
        currentArtistContext: action.artistContext ?? state.currentArtistContext,
        currentArtistName: action.artistName ?? state.currentArtistName,
        currentConfig: action.config,
        // An in-place track swap re-keys (and re-mounts) the audio hub; the
        // fresh hub reports no status on mount, so clear the stale one here
        // (otherwise the VFD keeps showing "playing" after the audio stopped).
        // A prior resolve error no longer applies to the freshly resolved track.
        previewStatus: null,
        resolveErrorVisible: false,
      };
  }
}

function initialShareUiState({
  artistInfoContext,
  artistName,
  config,
}: Pick<ShareLayoutProps, "artistInfoContext" | "artistName" | "config">): ShareUiState {
  return {
    artistReadyVisible: false,
    currentArtistContext: artistInfoContext ?? artistInfoContextFromConfig(config),
    currentArtistName: artistName,
    currentConfig: config,
    lastPropsConfigKey: configIdentity(config),
    previewStatus: null,
    resolveErrorVisible: false,
    resolveTriggeredArtistLoad: false,
    // Always the server's default. The persisted view is restored after mount
    // (see the restore effect) so the SSR markup and the client's first render
    // match — reading localStorage here would diverge and trip a hydration
    // mismatch on the cover stage.
    shareMediaView: ShareMediaView.Cover,
    sheetOpen: false,
  };
}

import type { ArtistCardLabels } from "@/components/artist/artistPanelTypes";
import { AudioStatus } from "@/components/audio/AudioStatus";
import { DesktopShareLayout } from "@/components/share/DesktopShareLayout";
import { MobileArtistSheet } from "@/components/share/MobileArtistSheet";
import { MobileShareLayout } from "@/components/share/MobileShareLayout";
import { ShareBackLink } from "@/components/share/ShareBackLink";
import { ShareMediaView, type ShareMediaView as ShareMediaViewType } from "@/components/share/ShareMediaView.types";
import { ToastProvider } from "@/context/ToastContext";
import { ArtistLoadStatus, useArtistInfo } from "@/hooks/useArtistInfo";
import { useIsClient } from "@/hooks/useIsClient";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOverlayEscape } from "@/hooks/useOverlayEscape";
import { LocaleProvider } from "@/i18n/context";
import { useT } from "@/i18n/localeContext";
import { CardSignal, sendMusicSignal } from "@/lib/analytics/umami";
import { detectRegion } from "@/lib/geo/detect-region";
import { commercialTrackResolver, type TrackResolver } from "@/lib/resolve/track-resolver";
import type { ArtistInfoContext } from "@/lib/share/artist-info-client";
import { replaceBrowserUrlWithShortUrl } from "@/lib/share/short-url";
import {
  type MediaCardContentConfiguration,
  MediaKindValue,
  type ShareContentConfiguration,
} from "@/lib/types/media-card";

export type { ArtistInfoContext };

const SHARE_MEDIA_VIEW_TOGGLE_KEY = "p";
const SHARE_MEDIA_VIEW_STORAGE_KEY = "musiccloud:share-media-view";
const SHARE_MEDIA_TOGGLE_TARGET_SELECTOR =
  "input, textarea, select, button, a[href], [contenteditable='true'], [contenteditable='']";

function readPersistedShareMediaView(): ShareMediaViewType {
  const documentView = readDocumentShareMediaView();
  if (documentView) return documentView;

  if (typeof window === "undefined") return ShareMediaView.Cover;
  try {
    return window.localStorage.getItem(SHARE_MEDIA_VIEW_STORAGE_KEY) === ShareMediaView.Turntable
      ? ShareMediaView.Turntable
      : ShareMediaView.Cover;
  } catch {
    return ShareMediaView.Cover;
  }
}

function readDocumentShareMediaView(): ShareMediaViewType | null {
  if (typeof document === "undefined") return null;
  const view = document.documentElement.dataset.shareMediaView;
  if (view === ShareMediaView.Turntable) return ShareMediaView.Turntable;
  if (view === ShareMediaView.Cover) return ShareMediaView.Cover;
  return null;
}

function writeDocumentShareMediaView(view: ShareMediaViewType): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.shareMediaView = view;
}

function persistShareMediaView(view: ShareMediaViewType): void {
  writeDocumentShareMediaView(view);
  try {
    window.localStorage.setItem(SHARE_MEDIA_VIEW_STORAGE_KEY, view);
  } catch {
    // Storage can be blocked in private/embedded contexts. The in-session
    // toggle should keep working even when persistence is unavailable.
  }
}

function nextShareMediaView(view: ShareMediaViewType): ShareMediaViewType {
  return view === ShareMediaView.Cover ? ShareMediaView.Turntable : ShareMediaView.Cover;
}

function isShareMediaToggleTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest(SHARE_MEDIA_TOGGLE_TARGET_SELECTOR));
}

function shouldIgnoreShareMediaViewToggle(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== SHARE_MEDIA_VIEW_TOGGLE_KEY) return true;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return true;
  return isShareMediaToggleTarget(event.target);
}

function normalizeArtistName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function artistInfoContextFromConfig(config: MediaCardContentConfiguration): ArtistInfoContext {
  return { shortId: config.shortId };
}

function sameArtistInfoContext(a: ArtistInfoContext, b: ArtistInfoContext): boolean {
  return (a.shortId ?? "") === (b.shortId ?? "") && (a.artistEntityId ?? "") === (b.artistEntityId ?? "");
}

function configIdentity(config: MediaCardContentConfiguration): string {
  const shareUrl = "shareUrl" in config ? config.shareUrl : "";
  const shortUrl = "shortUrl" in config ? config.shortUrl : "";
  return [config.type, config.title, config.artist, config.artworkUrl, shareUrl, shortUrl].join("::");
}

interface ShareLayoutProps {
  config: MediaCardContentConfiguration;
  artistName: string;
  artistInfoContext?: ArtistInfoContext;
  animated?: boolean;
  initialLocale?: string;
  /**
   * Optional back action. When present, a subtle "back" link is rendered
   * above the share cards so users who arrived here from a list view
   * (currently: genre-search discovery) can navigate back to that list
   * without losing it.
   */
  onBack?: () => void;
  /** Translated label for the back link. Required if `onBack` is given. */
  backLabel?: string;
  /**
   * Pre-supplied artist-column data. When `skipArtistFetch` is set, ShareLayout
   * renders this directly and runs no internal fetch — the Creative-Commons path
   * passes a Jamendo-built {@link ArtistInfoResponse} here. Commercial omits it.
   */
  artistData?: ArtistInfoResponse | null;
  /** Suppresses the internal artist-info fetch — used together with `artistData`. */
  skipArtistFetch?: boolean;
  /**
   * The resolver for a clicked popular/similar-track row. Defaults to
   * {@link commercialTrackResolver}; the CC path passes {@link ccTrackResolver}.
   * ShareLayout always resolves in place — it swaps the resolved config (and its
   * `ccInfoContent` / `ccJamendoArtistId`) without navigating or re-mounting.
   */
  trackResolver?: TrackResolver;
  /**
   * Per-title overrides for the artist-column sections, given as **i18n keys**
   * (not translated text). Commercial omits this and gets the default keys; the
   * CC path overrides individual titles (e.g. `artist.similarTracks`).
   * ShareLayout translates them via `t()`, so titles re-localize when the user
   * switches language.
   */
  labels?: Partial<ArtistCardLabels>;
}

export function ShareLayout({ initialLocale, ...props }: ShareLayoutProps) {
  return (
    <LocaleProvider initialLocale={initialLocale as import("@/i18n/locales").Locale | undefined}>
      <ToastProvider>
        <ShareLayoutInner {...props} />
      </ToastProvider>
    </LocaleProvider>
  );
}

function ShareLayoutInner({
  config,
  artistName,
  artistInfoContext,
  animated = false,
  onBack,
  backLabel,
  artistData: artistDataProp,
  skipArtistFetch = false,
  trackResolver = commercialTrackResolver,
  labels,
}: ShareLayoutProps) {
  const t = useT();
  // Section titles. The `labels` prop carries i18n KEY overrides (the CC caller
  // overrides `similar`/`profileProvidedBy`); translation happens here, reactive
  // to `t`, so titles re-localize on a language switch instead of staying frozen
  // at the value baked when the page was built. Memoized per resolved value so
  // the object identity stays stable for the GSAP/render path.
  const artistLabels = useMemo<ArtistCardLabels>(
    () => ({
      profile: t(labels?.profile ?? "artist.infoTitle"),
      popularTracks: t(labels?.popularTracks ?? "artist.popularTracks"),
      events: t(labels?.events ?? "artist.upcomingEvents"),
      similar: t(labels?.similar ?? "artist.similarArtists"),
      profileProvidedBy: t(labels?.profileProvidedBy ?? "artist.profileProvidedBy"),
    }),
    [t, labels?.profile, labels?.popularTracks, labels?.events, labels?.similar, labels?.profileProvidedBy],
  );
  // `detectRegion` reads the browser timezone once; memoize so it runs a single
  // time per mount.
  const userRegion = useMemo(() => detectRegion(), []);
  const [shareUiState, dispatchUi] = useReducer(
    shareUiReducer,
    { artistInfoContext, artistName, config },
    initialShareUiState,
  );
  const {
    artistReadyVisible,
    currentArtistContext,
    currentArtistName,
    currentConfig,
    previewStatus,
    resolveErrorVisible,
    resolveTriggeredArtistLoad,
    shareMediaView,
    sheetOpen,
  } = shareUiState;
  // Clears the "resolve triggered a load" UI flag once each artist-info load
  // settles, matching the order the inline fetch effect used.
  const handleArtistFetchSettled = useCallback(() => dispatchUi({ type: ShareUiActionType.ArtistFetchFinished }), []);
  const {
    status: artistLoadStatus,
    artistData,
    errorCode: artistErrorCode,
    isLoading,
  } = useArtistInfo({
    artistName: currentArtistName,
    userRegion,
    context: currentArtistContext,
    artistDataProp,
    skipArtistFetch,
    ccJamendoArtistId: currentConfig.ccJamendoArtistId,
    onFetchSettled: handleArtistFetchSettled,
  });
  const mounted = useIsClient();
  // Render ONLY the layout that matches the viewport, never both. Before mount
  // (SSR + first client render) both render — the CSS responsive classes hide
  // the wrong one, so there is no flash and SSR/hydration agree. After mount the
  // non-matching layout (a full second media card + the mobile artist sheet, all
  // previously display:none-but-still-recalculated) unmounts, halving the DOM and
  // — critically — the per-frame style recalc the day/night cross-fade triggers.
  // 1080px mirrors `MobileShareLayout`'s `min-[1080px]:hidden` breakpoint.
  const isDesktop = useMediaQuery("(min-width: 1080px)");
  const showDesktop = !mounted || isDesktop;
  const showMobile = !mounted || !isDesktop;

  useEffect(() => {
    dispatchUi({
      type: ShareUiActionType.PropsChanged,
      artistContext: artistInfoContext ?? artistInfoContextFromConfig(config),
      artistName,
      config,
      configKey: configIdentity(config),
    });
  }, [artistInfoContext, artistName, config]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreShareMediaViewToggle(event)) return;
      dispatchUi({ type: ShareUiActionType.MediaViewToggled });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Restore the persisted media view once after mount. The initial render uses
  // the server's `Cover` default (the server has no localStorage), so the SSR
  // markup and the client's first render match — no hydration mismatch. The
  // pre-paint inline script + the `html[data-share-media-view]` CSS override
  // (animations.css) hold the cover off-screen until this runs, so the
  // turntable view restores without a cover flash.
  useEffect(() => {
    const persisted = readPersistedShareMediaView();
    if (persisted !== ShareMediaView.Cover) {
      dispatchUi({ type: ShareUiActionType.MediaViewRestored, view: persisted });
    }
  }, []);

  // Persist the media view on change. Skips the initial mount so it cannot
  // clobber the persisted value before the restore effect above reads it.
  const mediaViewPersistReadyRef = useRef(false);
  useEffect(() => {
    if (!mediaViewPersistReadyRef.current) {
      mediaViewPersistReadyRef.current = true;
      return;
    }
    persistShareMediaView(shareMediaView);
  }, [shareMediaView]);

  const artistStatusLoading = isLoading || resolveTriggeredArtistLoad;
  useEffect(() => {
    if (artistStatusLoading || artistLoadStatus !== ArtistLoadStatus.Ready) {
      dispatchUi({ type: ShareUiActionType.ArtistReadyHidden });
      return;
    }

    dispatchUi({ type: ShareUiActionType.ArtistReadyVisible });
    const timeout = setTimeout(() => dispatchUi({ type: ShareUiActionType.ArtistReadyHidden }), 6000);
    return () => clearTimeout(timeout);
  }, [artistLoadStatus, artistStatusLoading]);

  useEffect(() => {
    if (!resolveErrorVisible) return;
    const timeout = setTimeout(() => dispatchUi({ type: ShareUiActionType.ResolveErrorHidden }), 6000);
    return () => clearTimeout(timeout);
  }, [resolveErrorVisible]);

  const playingStatus =
    config.mediaKind === MediaKindValue.Song ? t("audio.statusPlayingSong") : t("audio.statusPlaying");
  const pausedStatus = config.mediaKind === MediaKindValue.Song ? t("audio.statusPausedSong") : t("audio.statusPaused");
  const vfdStatusLine = artistStatusLoading
    ? t("artist.statusLoading")
    : resolveErrorVisible
      ? t("artist.statusResolveError")
      : artistLoadStatus === ArtistLoadStatus.Error
        ? t("artist.statusError", { code: artistErrorCode ?? "ERR" })
        : artistLoadStatus === ArtistLoadStatus.Empty
          ? t("artist.statusEmpty")
          : previewStatus === AudioStatus.Playing
            ? playingStatus
            : previewStatus === AudioStatus.Paused
              ? pausedStatus
              : artistReadyVisible
                ? t("artist.statusReady")
                : "";
  const enrichedConfig = useMemo(
    () => ({
      ...currentConfig,
      ...("platformsLabelKey" in currentConfig
        ? { platformsLabel: t((currentConfig as ShareContentConfiguration).platformsLabelKey) }
        : {}),
      // Fourth VFD row in SongInfo. Status is orchestrated here because the
      // signals live in different subtrees: artist-row resolve clicks, artist
      // info fetch state, and the preview player. VfdDisplay stays reusable
      // and only receives plain translated text.
      statusLine: vfdStatusLine,
    }),
    [currentConfig, t, vfdStatusLine],
  );

  const openSheet = useCallback(() => {
    sendMusicSignal(CardSignal.ArtistInfo);
    dispatchUi({ type: ShareUiActionType.OpenSheet });
  }, []);
  const closeSheet = useCallback(() => dispatchUi({ type: ShareUiActionType.CloseSheet }), []);
  const handlePreviewStatusChange = useCallback(
    (status: AudioStatus | null) => dispatchUi({ type: ShareUiActionType.PreviewStatusChanged, status }),
    [],
  );
  useOverlayEscape({ enabled: sheetOpen, onEscape: closeSheet });

  const handleArtistResolveStart = useCallback(() => {
    // A row click only clears a stale resolve error here. The VFD's "loading"
    // status is flipped on by `resolveTrack` itself, and only when the artist
    // actually changes — so a same-artist popular-track swap (which re-fetches
    // nothing) never shows a loading status that would then never clear.
    dispatchUi({ type: ShareUiActionType.ResolveErrorHidden });
  }, []);

  // One generic in-place resolve for both modes: the injected resolver turns the
  // clicked row into a resolved share update, then ShareLayout swaps the
  // config (and its `ccInfoContent` / `ccJamendoArtistId`) via `dispatchUi` and
  // rewrites the address bar — no navigation, no re-mount. Commercial and CC
  // differ only in the resolver, not in this mechanism.
  const resolveTrack = useCallback(
    async (track: ArtistTopTrack) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let keepResolveLoadingForArtistFetch = false;
      try {
        const update = await trackResolver(track.deezerUrl, {
          signal: controller.signal,
          t,
          configType: currentConfig.type,
        });
        replaceBrowserUrlWithShortUrl(update.shortUrl);
        // Will the artist column actually re-fetch? CC keys the column off
        // `ccJamendoArtistId` (a same-artist popular-track swap fetches nothing);
        // commercial keys off the artist name + narrowing context. Only then do
        // we flip the VFD to loading — otherwise a same-artist swap would show a
        // "loading" status that never clears (no fetch ever settles it).
        const nextCcArtistId = update.config.ccJamendoArtistId ?? "";
        const shouldFetchArtist = nextCcArtistId
          ? nextCcArtistId !== (currentConfig.ccJamendoArtistId ?? "")
          : normalizeArtistName(update.artistName) !== normalizeArtistName(currentArtistName) ||
            !sameArtistInfoContext(update.artistInfoContext ?? {}, currentArtistContext);
        keepResolveLoadingForArtistFetch = shouldFetchArtist;
        if (shouldFetchArtist) dispatchUi({ type: ShareUiActionType.ResolveStarted });
        dispatchUi({
          type: ShareUiActionType.Resolved,
          artistContext: update.artistInfoContext,
          artistName: shouldFetchArtist ? update.artistName : undefined,
          config: update.config,
        });
        if (update.pageTitle) document.title = update.pageTitle;
      } catch (err) {
        dispatchUi({ type: ShareUiActionType.ResolveErrorVisible });
        throw err;
      } finally {
        if (!keepResolveLoadingForArtistFetch) dispatchUi({ type: ShareUiActionType.ArtistFetchFinished });
        clearTimeout(timeout);
      }
    },
    [currentArtistContext, currentArtistName, currentConfig, t, trackResolver],
  );

  return (
    <div className="w-full">
      <ShareBackLink label={backLabel} onBack={onBack} />
      {showDesktop && (
        <DesktopShareLayout
          animated={animated}
          artistData={artistData}
          artistLoadStatus={artistLoadStatus}
          config={enrichedConfig}
          isLoading={isLoading}
          labels={artistLabels}
          onArtistResolveStart={handleArtistResolveStart}
          onPreviewStatusChange={handlePreviewStatusChange}
          onTrackResolve={resolveTrack}
          previewStatus={previewStatus}
          shareMediaView={shareMediaView}
          userRegion={userRegion}
        />
      )}
      {showMobile && (
        <MobileShareLayout
          animated={animated}
          config={enrichedConfig}
          label={t("artist.mobileButton")}
          onOpenSheet={openSheet}
          onPreviewStatusChange={handlePreviewStatusChange}
          previewStatus={previewStatus}
          shareMediaView={shareMediaView}
        />
      )}
      {mounted &&
        !isDesktop &&
        createPortal(
          <MobileArtistSheet
            artistData={artistData}
            artistLoadStatus={artistLoadStatus}
            closeLabel={t("artist.closeInfo")}
            isLoading={isLoading}
            labels={artistLabels}
            onArtistResolveStart={handleArtistResolveStart}
            onClose={closeSheet}
            onTrackResolve={resolveTrack}
            open={sheetOpen}
            userRegion={userRegion}
          />,
          document.body,
        )}
    </div>
  );
}
