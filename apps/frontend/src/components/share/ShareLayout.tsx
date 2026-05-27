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
import { type CSSProperties, useCallback, useEffect, useMemo, useReducer } from "react";
import { createPortal } from "react-dom";

type ArtistLoadStatus = "loading" | "ready" | "empty" | "error";
export interface ArtistInfoContext {
  shortId?: string;
  artistEntityId?: string;
}
type ArtistState = { status: ArtistLoadStatus; artistData: ArtistInfoResponse | null; errorCode?: string };
type ArtistAction =
  | { type: "loading" }
  | { type: "done"; data: ArtistInfoResponse | null }
  | { type: "error"; code: string };
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
  | { type: "artistFetchFinished" }
  | { type: "artistReadyHidden" }
  | { type: "artistReadyVisible" }
  | { type: "closeSheet" }
  | { type: "openSheet" }
  | { type: "previewStatusChanged"; status: AudioPreviewStatus | null }
  | {
      type: "propsChanged";
      artistContext: ArtistInfoContext;
      artistName: string;
      config: MediaCardContentConfiguration;
      configKey: string;
    }
  | { type: "resolveErrorHidden" }
  | { type: "resolveErrorVisible" }
  | { type: "resolveStarted" }
  | { type: "resolved"; artistContext?: ArtistInfoContext; artistName?: string; config: MediaCardContentConfiguration };

function hasArtistInfoContent(data: ArtistInfoResponse | null): boolean {
  return Boolean(
    data &&
      (data.profile ||
        (data.topTracks?.length ?? 0) > 0 ||
        (data.events?.length ?? 0) > 0 ||
        (data.similarArtistTracks?.length ?? 0) > 0),
  );
}

function artistReducer(state: ArtistState, action: ArtistAction): ArtistState {
  if (action.type === "loading") return { status: "loading", artistData: state.artistData };
  if (action.type === "error") return { status: "error", artistData: null, errorCode: action.code };
  return { status: hasArtistInfoContent(action.data) ? "ready" : "empty", artistData: action.data };
}

function shareUiReducer(state: ShareUiState, action: ShareUiAction): ShareUiState {
  switch (action.type) {
    case "artistFetchFinished":
      return { ...state, resolveTriggeredArtistLoad: false };
    case "artistReadyHidden":
      return { ...state, artistReadyVisible: false };
    case "artistReadyVisible":
      return { ...state, artistReadyVisible: true };
    case "closeSheet":
      return { ...state, sheetOpen: false };
    case "openSheet":
      return { ...state, sheetOpen: true };
    case "previewStatusChanged":
      return { ...state, previewStatus: action.status };
    case "propsChanged":
      if (state.lastPropsConfigKey === action.configKey) return state;
      return {
        ...state,
        currentArtistContext: action.artistContext,
        currentArtistName: action.artistName,
        currentConfig: action.config,
        lastPropsConfigKey: action.configKey,
      };
    case "resolveErrorHidden":
      return { ...state, resolveErrorVisible: false };
    case "resolveErrorVisible":
      return { ...state, resolveErrorVisible: true };
    case "resolveStarted":
      return { ...state, resolveErrorVisible: false, resolveTriggeredArtistLoad: true };
    case "resolved":
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
import { ArtistProfileDesktopCard } from "@/components/artist/ArtistProfileDesktopCard";
import { EventsCard } from "@/components/artist/EventsCard";
import { PopularTracksCard } from "@/components/artist/PopularTracksCard";
import type {
  ArtistPanelTrackResolveHandler,
  ArtistPanelTrackResolveOptions,
} from "@/components/artist/PopularTracksSection";
import { SimilarArtistsCard } from "@/components/artist/SimilarArtistsCard";
import { raisedControlRadius, recessedControlInset } from "@/components/cards/cardGeometry";
import { MediaSummaryCard } from "@/components/cards/MediaSummaryCard";
import { ServicesCard } from "@/components/cards/ServicesCard";
import { type AudioPreviewStatus, SharePageCard } from "@/components/share/SharePageCard";
import { BackLink } from "@/components/ui/BackLink";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { OverlayBackdrop } from "@/components/ui/OverlayBackdrop";
import { ToastProvider } from "@/context/ToastContext";
import { useIsClient } from "@/hooks/useIsClient";
import { useOverlayEscape } from "@/hooks/useOverlayEscape";
import { LocaleProvider, useT } from "@/i18n/context";
import { trackResolve, trackResolveFailed, trackResolveStarted } from "@/lib/analytics";
import { detectServiceFromUrl } from "@/lib/platform/url";
import { buildActiveConfig, parseUnifiedResolveResponse } from "@/lib/resolve/parsers";
import { buildShareViewFromResolvedResponse } from "@/lib/share/share-view";
import type { ActiveResult } from "@/lib/types/app";
import type { MediaCardContentConfiguration, ShareContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";

const MEDIA_W = 512;
const ARTIST_W = 512;
const GAP = 24;

// Maps IANA timezone to ISO 3166-1 alpha-2 country code.
const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  "Europe/Vienna": "AT",
  "Europe/Berlin": "DE",
  "Europe/Zurich": "CH",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Paris": "FR",
  "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE",
  "Europe/Luxembourg": "LU",
  "Europe/Rome": "IT",
  "Europe/Madrid": "ES",
  "Europe/Lisbon": "PT",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Copenhagen": "DK",
  "Europe/Helsinki": "FI",
  "Europe/Tallinn": "EE",
  "Europe/Riga": "LV",
  "Europe/Vilnius": "LT",
  "Europe/Warsaw": "PL",
  "Europe/Prague": "CZ",
  "Europe/Bratislava": "SK",
  "Europe/Budapest": "HU",
  "Europe/Ljubljana": "SI",
  "Europe/Zagreb": "HR",
  "Europe/Bucharest": "RO",
  "Europe/Sofia": "BG",
  "Europe/Athens": "GR",
  "Europe/Istanbul": "TR",
  "Europe/Kyiv": "UA",
  "Europe/Moscow": "RU",
  "Europe/Belgrade": "RS",
  "Europe/Sarajevo": "BA",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Phoenix": "US",
  "America/Anchorage": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Montreal": "CA",
  "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR",
  "America/Buenos_Aires": "AR",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Shanghai": "CN",
  "Asia/Hong_Kong": "HK",
  "Asia/Taipei": "TW",
  "Asia/Singapore": "SG",
  "Asia/Bangkok": "TH",
  "Asia/Jakarta": "ID",
  "Asia/Manila": "PH",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Karachi": "PK",
  "Asia/Dhaka": "BD",
  "Asia/Tehran": "IR",
  "Asia/Baghdad": "IQ",
  "Asia/Riyadh": "SA",
  "Asia/Jerusalem": "IL",
  "Asia/Dubai": "AE",
  "Asia/Kolkata": "IN",
  "Asia/Colombo": "LK",
  "Africa/Cairo": "EG",
  "Africa/Johannesburg": "ZA",
  "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE",
  "Africa/Casablanca": "MA",
  "Africa/Algiers": "DZ",
  "Africa/Tunis": "TN",
  "America/Bogota": "CO",
  "America/Lima": "PE",
  "America/Santiago": "CL",
  "America/Caracas": "VE",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Pacific/Auckland": "NZ",
};

function detectRegion(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONE_TO_COUNTRY[tz] ?? "";
  } catch {
    return "";
  }
}

async function fetchArtistInfo(
  artistName: string,
  userRegion: string,
  context: ArtistInfoContext,
  signal: AbortSignal,
): Promise<ArtistInfoResponse> {
  const params = new URLSearchParams({ name: artistName });
  if (userRegion) params.set("region", userRegion);
  if (context.shortId) params.set("shortId", context.shortId);
  if (context.artistEntityId) params.set("artistEntityId", context.artistEntityId);
  const res = await fetch(`${ENDPOINTS.frontend.artistInfo}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ArtistInfoResponse;
}

function artistFetchErrorCode(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") return "TIMEOUT";
  if (err instanceof Error && /^HTTP \d+/.test(err.message)) return err.message;
  return "ERR";
}

function normalizeArtistName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function pathFromShortUrl(shortUrl: string): string {
  try {
    const base = typeof window === "undefined" ? "https://musiccloud.io" : window.location.origin;
    return new URL(shortUrl, base).pathname;
  } catch {
    return "/";
  }
}

function replaceBrowserUrlWithShortUrl(shortUrl: string): void {
  if (typeof window === "undefined") return;
  const nextPath = pathFromShortUrl(shortUrl);
  const nextUrl = new URL(window.location.href);
  nextUrl.pathname = nextPath;
  nextUrl.search = "";
  nextUrl.hash = "";
  window.history.replaceState(window.history.state, "", nextUrl);
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
  return active.kind === "artist" ? active.name : active.artist;
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
}: ShareLayoutProps) {
  const t = useT();
  const userRegion = useMemo(detectRegion, []);
  const [artistState, dispatch] = useReducer(artistReducer, {
    status: "loading",
    artistData: null,
  });
  const { status: artistLoadStatus, artistData, errorCode: artistErrorCode } = artistState;
  const isLoading = artistLoadStatus === "loading";
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
  const mounted = useIsClient();

  useEffect(() => {
    dispatchUi({
      type: "propsChanged",
      artistContext: artistInfoContext ?? artistInfoContextFromConfig(config),
      artistName,
      config,
      configKey: configIdentity(config),
    });
  }, [artistInfoContext, artistName, config]);

  const artistStatusLoading = isLoading || resolveTriggeredArtistLoad;
  useEffect(() => {
    if (artistStatusLoading || artistLoadStatus !== "ready") {
      dispatchUi({ type: "artistReadyHidden" });
      return;
    }

    dispatchUi({ type: "artistReadyVisible" });
    const timeout = setTimeout(() => dispatchUi({ type: "artistReadyHidden" }), 6000);
    return () => clearTimeout(timeout);
  }, [artistLoadStatus, artistStatusLoading]);

  useEffect(() => {
    if (!resolveErrorVisible) return;
    const timeout = setTimeout(() => dispatchUi({ type: "resolveErrorHidden" }), 6000);
    return () => clearTimeout(timeout);
  }, [resolveErrorVisible]);

  const vfdStatusLine = artistStatusLoading
    ? t("artist.statusLoading")
    : resolveErrorVisible
      ? t("artist.statusResolveError")
      : artistLoadStatus === "error"
        ? t("artist.statusError", { code: artistErrorCode ?? "ERR" })
        : artistLoadStatus === "empty"
          ? t("artist.statusEmpty")
          : previewStatus === "playing"
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

  // Fetch artist data immediately (SSR already rendered the share card)
  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "loading" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    fetchArtistInfo(currentArtistName, userRegion, currentArtistContext, controller.signal)
      .then((data) => {
        if (!cancelled) dispatch({ type: "done", data });
      })
      .catch((err) => {
        if (!cancelled) dispatch({ type: "error", code: artistFetchErrorCode(err) });
      })
      .finally(() => {
        if (!cancelled) dispatchUi({ type: "artistFetchFinished" });
        clearTimeout(timeout);
      });
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [currentArtistContext, currentArtistName, userRegion]);

  const openSheet = useCallback(() => dispatchUi({ type: "openSheet" }), []);
  const closeSheet = useCallback(() => dispatchUi({ type: "closeSheet" }), []);
  const handlePreviewStatusChange = useCallback(
    (status: AudioPreviewStatus | null) => dispatchUi({ type: "previewStatusChanged", status }),
    [],
  );
  useOverlayEscape({ enabled: sheetOpen, onEscape: closeSheet });

  const handleArtistResolveStart = useCallback(() => {
    // Popular/Similar rows show their spinning disc immediately on click,
    // before the resolve request returns and before artist-info loading starts.
    // Lift that moment into ShareLayout so the VFD flips to loading in sync
    // with the visible spinning-disc affordance.
    dispatchUi({ type: "resolveStarted" });
  }, []);

  const handleTrackResolve = useCallback(
    async (track: ArtistTopTrack, options: ArtistPanelTrackResolveOptions) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let keepResolveLoadingForArtistFetch = false;
      const sourcePlatform = detectServiceFromUrl(track.deezerUrl);
      // Popular Tracks and Similar Artists are secondary navigation clicks.
      // Count the click itself, but do not treat the follow-up resolve request
      // as a user-intent resolve in Website Analytics or Umami.
      if (!options.suppressResolveAnalytics) trackResolveStarted(sourcePlatform, options.surface);
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
        if (currentConfig.type === "share") {
          const next = buildShareViewFromResolvedResponse(resolved, t);
          const shouldFetchArtist =
            normalizeArtistName(next.artistName) !== normalizeArtistName(currentArtistName) ||
            !sameArtistInfoContext(next.artistInfoContext, currentArtistContext);
          keepResolveLoadingForArtistFetch = shouldFetchArtist;
          dispatchUi({
            type: "resolved",
            artistContext: next.artistInfoContext,
            artistName: shouldFetchArtist ? next.artistName : undefined,
            config: next.config,
          });
          document.title = next.pageTitle;
          if (!options.suppressResolveAnalytics) trackResolve(sourcePlatform, options.surface);
          return;
        }

        const active = parseUnifiedResolveResponse(resolved);
        const nextArtistName = resultArtistName(active);
        const shouldFetchArtist = normalizeArtistName(nextArtistName) !== normalizeArtistName(currentArtistName);
        keepResolveLoadingForArtistFetch = shouldFetchArtist;
        dispatchUi({
          type: "resolved",
          artistName: shouldFetchArtist ? nextArtistName : undefined,
          config: buildActiveConfig(active, t),
        });
        if (!options.suppressResolveAnalytics) trackResolve(sourcePlatform, options.surface);
      } catch (err) {
        dispatchUi({ type: "resolveErrorVisible" });
        if (!options.suppressResolveAnalytics) {
          trackResolveFailed(sourcePlatform, options.surface, err instanceof Error ? err.message : "error.generic");
        }
        throw err;
      } finally {
        if (!keepResolveLoadingForArtistFetch) dispatchUi({ type: "artistFetchFinished" });
        clearTimeout(timeout);
      }
    },
    [currentArtistContext, currentArtistName, currentConfig, t],
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
        onArtistResolveStart={handleArtistResolveStart}
        onPreviewStatusChange={handlePreviewStatusChange}
        onTrackResolve={handleTrackResolve}
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
            onArtistResolveStart={handleArtistResolveStart}
            onClose={closeSheet}
            onTrackResolve={handleTrackResolve}
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
    <div className="mx-auto mb-3 min-[1080px]:mb-4" style={{ maxWidth: `${MEDIA_W + GAP + ARTIST_W}px` }}>
      <BackLink onClick={onBack} label={label} />
    </div>
  );
}

interface DesktopShareLayoutProps {
  animated: boolean;
  artistData: ArtistInfoResponse | null;
  artistLoadStatus: ArtistLoadStatus;
  config: MediaCardContentConfiguration;
  isLoading: boolean;
  onArtistResolveStart: () => void;
  onPreviewStatusChange: (status: AudioPreviewStatus | null) => void;
  onTrackResolve: ArtistPanelTrackResolveHandler;
  userRegion: string;
}

function DesktopShareLayout({
  animated,
  artistData,
  artistLoadStatus,
  config,
  isLoading,
  onArtistResolveStart,
  onPreviewStatusChange,
  onTrackResolve,
  userRegion,
}: DesktopShareLayoutProps) {
  return (
    <div
      className="hidden min-[1080px]:grid grid-cols-[512px_512px] items-start gap-6 mx-auto"
      style={{ width: `${MEDIA_W + GAP + ARTIST_W}px` }}
    >
      <div className="flex flex-col gap-6" style={{ width: `${MEDIA_W}px` }}>
        <MediaSummaryCard content={config} animated={animated} onPreviewStatusChange={onPreviewStatusChange} />
        <ServicesCard content={config} animated={animated} />
      </div>
      <div className="flex flex-col gap-6" style={{ width: `${ARTIST_W}px` }}>
        <ArtistProfileDesktopCard data={artistData} isLoading={isLoading} status={artistLoadStatus} />
        <PopularTracksCard
          data={artistData}
          isLoading={isLoading}
          onTrackResolve={onTrackResolve}
          onResolveStart={onArtistResolveStart}
        />
        <EventsCard data={artistData} isLoading={isLoading} userRegion={userRegion} />
        <SimilarArtistsCard
          data={artistData}
          isLoading={isLoading}
          onTrackResolve={onTrackResolve}
          onResolveStart={onArtistResolveStart}
        />
      </div>
    </div>
  );
}

interface MobileShareLayoutProps {
  animated: boolean;
  config: MediaCardContentConfiguration;
  label: string;
  onOpenSheet: () => void;
  onPreviewStatusChange: (status: AudioPreviewStatus | null) => void;
}

function MobileShareLayout({ animated, config, label, onOpenSheet, onPreviewStatusChange }: MobileShareLayoutProps) {
  return (
    <div className="block min-[1080px]:hidden">
      <SharePageCard config={config} animated={animated} onPreviewStatusChange={onPreviewStatusChange} />
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
  artistLoadStatus: ArtistLoadStatus;
  closeLabel: string;
  isLoading: boolean;
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
  onArtistResolveStart,
  onClose,
  onTrackResolve,
  open,
  userRegion,
}: MobileArtistSheetProps) {
  const handleTrackResolve = useCallback<ArtistPanelTrackResolveHandler>(
    async (track, options) => {
      onClose();
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "smooth" }));
      await onTrackResolve(track, options);
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
