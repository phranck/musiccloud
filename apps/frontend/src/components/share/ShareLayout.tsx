/**
 * ShareLayout
 *
 * Desktop/tablet: split media, actions, services, and artist data cards,
 *                 horizontally centered. Artist data is fetched immediately.
 *
 * Mobile: SharePageCard only, with a button that opens ArtistInfoCard
 *         as a bottom sheet.
 */

import {
  type ArtistInfoResponse,
  type ArtistTopTrack,
  ENDPOINTS,
  type ResolveErrorResponse,
  type UnifiedResolveSuccessResponse,
} from "@musiccloud/shared";
import { MicrophoneStageIcon, XIcon } from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useReducer } from "react";
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

import { ArtistInfoCard } from "@/components/artist/ArtistInfoCard";
import type {
  ArtistCardLabels,
  ArtistInfoStatus,
  ArtistPanelTrackResolveHandler,
} from "@/components/artist/artistPanelTypes";
import { AudioPreviewStatus } from "@/components/audio/AudioPreviewStatus";
import { raisedControlRadius, recessedControlInset } from "@/components/cards/cardGeometry";
import { MediaSummaryCard } from "@/components/cards/MediaSummaryCard";
import { ServicesCard } from "@/components/cards/ServicesCard";
import { AnimatedArtistColumn } from "@/components/share/AnimatedArtistColumn";
import { SharePageCard } from "@/components/share/SharePageCard";
import { ARTIST_W, MEDIA_W, TWO_COLUMN_TOTAL_W, TwoColumnResultGrid } from "@/components/share/TwoColumnResultGrid";
import { BackLink } from "@/components/ui/BackLink";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { OverlayBackdrop } from "@/components/ui/OverlayBackdrop";
import { ToastProvider } from "@/context/ToastContext";
import { ArtistLoadStatus, useArtistInfo } from "@/hooks/useArtistInfo";
import { useIsClient } from "@/hooks/useIsClient";
import { useOverlayEscape } from "@/hooks/useOverlayEscape";
import { LocaleProvider } from "@/i18n/context";
import { useT } from "@/i18n/localeContext";
import { CardSignal, sendMusicSignal } from "@/lib/analytics/umami";
import { detectRegion } from "@/lib/geo/detect-region";
import { buildActiveConfig, parseUnifiedResolveResponse } from "@/lib/resolve/parsers";
import type { ArtistInfoContext } from "@/lib/share/artist-info-client";

export type { ArtistInfoContext };

import { buildShareViewFromResolvedResponse } from "@/lib/share/share-view";
import { replaceBrowserUrlWithShortUrl } from "@/lib/share/short-url";
import type { ActiveResult } from "@/lib/types/app";
import type { MediaCardContentConfiguration, ShareContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";

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
    }),
    [t, labels?.profile, labels?.popularTracks, labels?.events, labels?.similar],
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

  const vfdStatusLine = artistStatusLoading
    ? t("artist.statusLoading")
    : resolveErrorVisible
      ? t("artist.statusResolveError")
      : artistLoadStatus === ArtistLoadStatus.Error
        ? t("artist.statusError", { code: artistErrorCode ?? "ERR" })
        : artistLoadStatus === ArtistLoadStatus.Empty
          ? t("artist.statusEmpty")
          : previewStatus === AudioPreviewStatus.Playing
            ? t("audio.statusPlaying")
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
        const response = await fetch(ENDPOINTS.frontend.resolve, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: track.deezerUrl }),
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as
          | UnifiedResolveSuccessResponse
          | Partial<ResolveErrorResponse>
          | { status?: string };
        if (!response.ok) {
          throw new Error("message" in data && data.message ? data.message : "error.generic");
        }
        if ("status" in data && data.status) {
          throw new Error("resolve did not return a final result");
        }

        const resolved = data as UnifiedResolveSuccessResponse;
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

function ShareBackLink({ label, onBack }: { label?: string; onBack?: () => void }) {
  if (!onBack || !label) return null;

  return (
    <div className="mx-auto mb-3 min-[1080px]:mb-4" style={{ maxWidth: `${TWO_COLUMN_TOTAL_W}px` }}>
      <BackLink onClick={onBack} label={label} />
    </div>
  );
}

interface DesktopShareLayoutProps {
  animated: boolean;
  artistData: ArtistInfoResponse | null;
  artistLoadStatus: ArtistInfoStatus;
  config: MediaCardContentConfiguration;
  isLoading: boolean;
  labels: ArtistCardLabels;
  onArtistResolveStart: () => void;
  onPreviewStatusChange: (status: AudioPreviewStatus | null) => void;
  onTrackResolve: ArtistPanelTrackResolveHandler;
  secondaryCard?: ReactNode;
  userRegion: string;
}

function DesktopShareLayout({
  animated,
  artistData,
  artistLoadStatus,
  config,
  isLoading,
  labels,
  onArtistResolveStart,
  onPreviewStatusChange,
  onTrackResolve,
  secondaryCard,
  userRegion,
}: DesktopShareLayoutProps) {
  return (
    <TwoColumnResultGrid
      left={
        <div className="flex flex-col gap-[var(--mc-gap-cards,1.5rem)]" style={{ width: `${MEDIA_W}px` }}>
          <MediaSummaryCard content={config} animated={animated} onPreviewStatusChange={onPreviewStatusChange} />
          {secondaryCard ?? <ServicesCard content={config} animated={animated} />}
        </div>
      }
      right={
        <AnimatedArtistColumn
          artistData={artistData}
          artistLoadStatus={artistLoadStatus}
          isLoading={isLoading}
          labels={labels}
          onArtistResolveStart={onArtistResolveStart}
          onTrackResolve={onTrackResolve}
          userRegion={userRegion}
          widthPx={ARTIST_W}
        />
      }
    />
  );
}

interface MobileShareLayoutProps {
  animated: boolean;
  config: MediaCardContentConfiguration;
  label: string;
  onOpenSheet: () => void;
  onPreviewStatusChange: (status: AudioPreviewStatus | null) => void;
  secondaryCard?: ReactNode;
}

function MobileShareLayout({
  animated,
  config,
  label,
  onOpenSheet,
  onPreviewStatusChange,
  secondaryCard,
}: MobileShareLayoutProps) {
  return (
    <div className="block min-[1080px]:hidden">
      <SharePageCard config={config} animated={animated} onPreviewStatusChange={onPreviewStatusChange} />
      {secondaryCard && <div className="mt-[var(--mc-gap-cards,1.5rem)]">{secondaryCard}</div>}
      <div className="mt-3 flex justify-center px-3">
        <EmbossedButton
          as="button"
          type="button"
          onClick={onOpenSheet}
          className="flex min-h-[48px] w-[calc((100%-0.125rem)/2-var(--mc-recessed-control-inset))] items-center justify-center gap-3 px-3 text-base text-text-primary max-[389px]:min-h-[40px] max-[389px]:gap-1.5 max-[389px]:px-2 max-[389px]:text-[13px] max-[389px]:font-normal min-[390px]:font-medium"
          style={
            {
              "--mc-recessed-control-inset": recessedControlInset,
              "--neu-radius-base": raisedControlRadius,
              "--neu-radius-sm": raisedControlRadius,
            } as CSSProperties
          }
        >
          <MicrophoneStageIcon className="size-6 flex-shrink-0 max-[389px]:size-5" weight="duotone" />
          <span className="truncate leading-none">{label}</span>
        </EmbossedButton>
      </div>
    </div>
  );
}

interface MobileArtistSheetProps {
  artistData: ArtistInfoResponse | null;
  artistLoadStatus: ArtistInfoStatus;
  closeLabel: string;
  isLoading: boolean;
  labels: ArtistCardLabels;
  onArtistResolveStart: () => void;
  onClose: () => void;
  onTrackResolve: ArtistPanelTrackResolveHandler;
  open: boolean;
  userRegion: string;
}

function MobileArtistSheet({
  artistData,
  artistLoadStatus,
  closeLabel,
  isLoading,
  labels,
  onArtistResolveStart,
  onClose,
  onTrackResolve,
  open,
  userRegion,
}: MobileArtistSheetProps) {
  const handleTrackResolve = useCallback<ArtistPanelTrackResolveHandler>(
    async (track) => {
      onClose();
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "smooth" }));
      await onTrackResolve(track);
    },
    [onClose, onTrackResolve],
  );

  return (
    <div>
      <div
        className={cn(
          "fixed inset-0 z-50 flex flex-col justify-end",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <OverlayBackdrop open={open} onClick={onClose} ariaLabel={closeLabel} />
        <div
          className={cn(
            "relative z-10 rounded-t-[36px] bg-surface-elevated max-h-[85dvh] flex flex-col",
            "transition-transform duration-300 ease-out",
            open ? "translate-y-0" : "translate-y-full",
          )}
        >
          <div className="flex items-center justify-between px-5 pt-3 pb-2 flex-shrink-0">
            <div className="w-8" />
            <div className="h-1 w-10 rounded-full bg-[var(--border)]" />
            <button
              type="button"
              onClick={onClose}
              className="size-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-text-secondary hover:bg-white/[0.12] hover:text-text-primary transition-colors"
              aria-label={closeLabel}
            >
              <XIcon size={16} weight="duotone" />
            </button>
          </div>
          <div className="overflow-y-auto px-3 pb-8">
            <ArtistInfoCard
              data={artistData}
              isLoading={isLoading}
              labels={labels}
              status={artistLoadStatus}
              userRegion={userRegion}
              onTrackResolve={handleTrackResolve}
              onResolveStart={onArtistResolveStart}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
