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
import { useCallback, useEffect, useMemo, useReducer } from "react";
import { createPortal } from "react-dom";

const ShareUiActionType = {
  ArtistFetchFinished: "artistFetchFinished",
  ArtistReadyHidden: "artistReadyHidden",
  ArtistReadyVisible: "artistReadyVisible",
  CloseSheet: "closeSheet",
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
  previewStatus: AudioPreviewStatus | null;
  resolveErrorVisible: boolean;
  resolveTriggeredArtistLoad: boolean;
  sheetOpen: boolean;
}
type ShareUiAction =
  | { type: typeof ShareUiActionType.ArtistFetchFinished }
  | { type: typeof ShareUiActionType.ArtistReadyHidden }
  | { type: typeof ShareUiActionType.ArtistReadyVisible }
  | { type: typeof ShareUiActionType.CloseSheet }
  | { type: typeof ShareUiActionType.OpenSheet }
  | { type: typeof ShareUiActionType.PreviewStatusChanged; status: AudioPreviewStatus | null }
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
    sheetOpen: false,
  };
}

import type { ArtistCardLabels } from "@/components/artist/artistPanelTypes";
import { AudioPreviewStatus } from "@/components/audio/AudioPreviewStatus";
import { DesktopShareLayout } from "@/components/share/DesktopShareLayout";
import { MobileArtistSheet } from "@/components/share/MobileArtistSheet";
import { MobileShareLayout } from "@/components/share/MobileShareLayout";
import { ShareBackLink } from "@/components/share/ShareBackLink";
import { ToastProvider } from "@/context/ToastContext";
import { ArtistLoadStatus, useArtistInfo } from "@/hooks/useArtistInfo";
import { useIsClient } from "@/hooks/useIsClient";
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
   * Per-title overrides for the artist-column sections. Commercial omits this
   * and gets the i18n defaults; the CC path overrides individual titles
   * (e.g. "Similar Tracks" instead of "Similar Artists").
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
  // Commercial section titles are the defaults; the CC caller overrides
  // individual ones via the `labels` prop (e.g. "Similar Tracks"). Memoized per
  // resolved value so the object identity stays stable for the GSAP/render path
  // even when the caller passes an inline override.
  const artistLabels = useMemo<ArtistCardLabels>(
    () => ({
      profile: labels?.profile ?? t("artist.infoTitle"),
      popularTracks: labels?.popularTracks ?? t("artist.popularTracks"),
      events: labels?.events ?? t("artist.upcomingEvents"),
      similar: labels?.similar ?? t("artist.similarArtists"),
      profileProvidedBy: labels?.profileProvidedBy ?? t("artist.profileProvidedBy"),
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

  useEffect(() => {
    dispatchUi({
      type: ShareUiActionType.PropsChanged,
      artistContext: artistInfoContext ?? artistInfoContextFromConfig(config),
      artistName,
      config,
      configKey: configIdentity(config),
    });
  }, [artistInfoContext, artistName, config]);

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
  const vfdStatusLine = artistStatusLoading
    ? t("artist.statusLoading")
    : resolveErrorVisible
      ? t("artist.statusResolveError")
      : artistLoadStatus === ArtistLoadStatus.Error
        ? t("artist.statusError", { code: artistErrorCode ?? "ERR" })
        : artistLoadStatus === ArtistLoadStatus.Empty
          ? t("artist.statusEmpty")
          : previewStatus === AudioPreviewStatus.Playing
            ? playingStatus
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
    (status: AudioPreviewStatus | null) => dispatchUi({ type: ShareUiActionType.PreviewStatusChanged, status }),
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
        userRegion={userRegion}
      />
      <MobileShareLayout
        animated={animated}
        config={enrichedConfig}
        label={t("artist.mobileButton")}
        onOpenSheet={openSheet}
        onPreviewStatusChange={handlePreviewStatusChange}
      />
      {mounted &&
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
