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
import { type ReactNode, useCallback, useEffect, useMemo, useReducer } from "react";
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

const ResolveResultKind = {
  Artist: "artist",
} as const;

const ShareConfigType = {
  Share: "share",
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

import type { ArtistCardLabels, ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
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
import { buildActiveConfig, parseUnifiedResolveResponse } from "@/lib/resolve/parsers";
import { resolveTrackQuery } from "@/lib/resolve/resolve-client";
import type { ArtistInfoContext } from "@/lib/share/artist-info-client";
import { buildShareViewFromResolvedResponse } from "@/lib/share/share-view";
import { replaceBrowserUrlWithShortUrl } from "@/lib/share/short-url";
import type { ActiveResult } from "@/lib/types/app";
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

function resultArtistName(active: ActiveResult): string {
  return active.kind === ResolveResultKind.Artist ? active.name : active.artist;
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
  /** Suppresses the internal commercial artist-info fetch (CC has no such endpoint). */
  skipArtistFetch?: boolean;
  /**
   * Card rendered below `MediaSummaryCard` in the left column. Defaults to the
   * commercial `<ServicesCard>`. The CC path passes `<CcInfoCard>` (license /
   * attribution). On mobile it renders below the share card only when provided
   * (commercial keeps its platform grid inside the share card).
   */
  secondaryCard?: ReactNode;
  /**
   * Resolves a clicked popular/similar-track row. Defaults to the commercial
   * in-place resolve (`POST /api/resolve`). The CC path passes a handler that
   * resolves the row's `jamendo:<id>` candidate through the CC endpoint.
   */
  onTrackResolve?: ArtistPanelTrackResolveHandler;
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
  secondaryCard,
  onTrackResolve,
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
    // Popular/Similar rows show their spinning disc immediately on click,
    // before the resolve request returns and before artist-info loading starts.
    // Lift that moment into ShareLayout so the VFD flips to loading in sync
    // with the visible spinning-disc affordance.
    dispatchUi({ type: ShareUiActionType.ResolveStarted });
  }, []);

  const handleTrackResolve = useCallback(
    async (track: ArtistTopTrack) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let keepResolveLoadingForArtistFetch = false;
      try {
        const resolved = await resolveTrackQuery(track.deezerUrl, controller.signal);
        replaceBrowserUrlWithShortUrl(resolved.shortUrl);
        if (currentConfig.type === ShareConfigType.Share) {
          const next = buildShareViewFromResolvedResponse(resolved, t);
          const shouldFetchArtist =
            normalizeArtistName(next.artistName) !== normalizeArtistName(currentArtistName) ||
            !sameArtistInfoContext(next.artistInfoContext, currentArtistContext);
          keepResolveLoadingForArtistFetch = shouldFetchArtist;
          dispatchUi({
            type: ShareUiActionType.Resolved,
            artistContext: next.artistInfoContext,
            artistName: shouldFetchArtist ? next.artistName : undefined,
            config: next.config,
          });
          document.title = next.pageTitle;
          return;
        }

        const active = parseUnifiedResolveResponse(resolved);
        const nextArtistName = resultArtistName(active);
        const shouldFetchArtist = normalizeArtistName(nextArtistName) !== normalizeArtistName(currentArtistName);
        keepResolveLoadingForArtistFetch = shouldFetchArtist;
        dispatchUi({
          type: ShareUiActionType.Resolved,
          artistName: shouldFetchArtist ? nextArtistName : undefined,
          config: buildActiveConfig(active, t),
        });
      } catch (err) {
        dispatchUi({ type: ShareUiActionType.ResolveErrorVisible });
        throw err;
      } finally {
        if (!keepResolveLoadingForArtistFetch) dispatchUi({ type: ShareUiActionType.ArtistFetchFinished });
        clearTimeout(timeout);
      }
    },
    [currentArtistContext, currentArtistName, currentConfig, t],
  );

  // Commercial in-place resolve by default; the CC path injects its own handler.
  const resolveTrack = onTrackResolve ?? handleTrackResolve;

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
        secondaryCard={secondaryCard}
        userRegion={userRegion}
      />
      <MobileShareLayout
        animated={animated}
        config={enrichedConfig}
        label={t("artist.mobileButton")}
        onOpenSheet={openSheet}
        onPreviewStatusChange={handlePreviewStatusChange}
        secondaryCard={secondaryCard}
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
