/**
 * ShareLayout
 *
 * Desktop: MediaCard and ArtistInfoCard side-by-side, horizontally centered.
 *          Artist data is fetched immediately on mount.
 *
 * Mobile (< sm): MediaCard only, with a button that opens ArtistInfoCard
 *                as a bottom sheet.
 */

import { type ArtistInfoResponse, ENDPOINTS } from "@musiccloud/shared";
import { UserIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { createPortal } from "react-dom";

type ArtistState = { isLoading: boolean; artistData: ArtistInfoResponse | null };
type ArtistAction = { type: "loading" } | { type: "done"; data: ArtistInfoResponse | null };

function artistReducer(_: ArtistState, action: ArtistAction): ArtistState {
  if (action.type === "loading") return { isLoading: true, artistData: null };
  return { isLoading: false, artistData: action.data };
}

import { ArtistInfoCard } from "@/components/share/ArtistInfoCard";
import { SharePageCard } from "@/components/share/SharePageCard";
import { BackLink } from "@/components/ui/BackLink";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { ToastProvider } from "@/context/ToastContext";
import { useAlbumColors } from "@/hooks/useAlbumColors";
import { useIsClient } from "@/hooks/useIsClient";
import { LocaleProvider, useT } from "@/i18n/context";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";
import { hexToRgb } from "@/lib/ui/colors";
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
  signal: AbortSignal,
): Promise<ArtistInfoResponse | null> {
  const params = new URLSearchParams({ name: artistName });
  if (userRegion) params.set("region", userRegion);
  const res = await fetch(`${ENDPOINTS.frontend.artistInfo}?${params.toString()}`, { signal });
  return res.ok ? ((await res.json()) as ArtistInfoResponse) : null;
}

interface ShareLayoutProps {
  config: MediaCardContentConfiguration;
  artistName: string;
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

function ShareLayoutInner({ config, artistName, animated = false, onBack, backLabel }: ShareLayoutProps) {
  const t = useT();
  // Detect region synchronously on first render (client-only, Astro island)
  const [userRegion] = useState(detectRegion);
  const [{ isLoading, artistData }, dispatch] = useReducer(artistReducer, {
    isLoading: true,
    artistData: null,
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const mounted = useIsClient();

  // Dynamic accent color extraction from album artwork. The accent kicks in
  // as soon as the image has loaded and the colors are computed.
  //
  // Rendering strategy (see ShareButton): accent-tinted elements read
  // `--color-accent-resolved` — a sentinel that is ONLY set once we have a
  // real dynamic accent. Until then they render in a neutral pre-accent
  // state. This avoids the "flash from wrong accent to right accent" on
  // first paint: users see a neutral surface, which then gently reveals
  // the dynamic accent — never a jarring color swap.
  //
  // Safety net: if extraction hasn't produced an accent after 3 s
  // (broken CORS, dead artwork URL, canvas tainted), we fall back to the
  // brand default so the button doesn't stay visually muted forever.
  const { dynamicAccent, handleAlbumArtLoad } = useAlbumColors();
  const [extractionTimedOut, setExtractionTimedOut] = useState(false);
  useEffect(() => {
    if (dynamicAccent) return;
    const timer = setTimeout(() => setExtractionTimedOut(true), 3000);
    return () => clearTimeout(timer);
  }, [dynamicAccent]);

  const accentStyle = (
    dynamicAccent
      ? {
          "--color-accent": dynamicAccent.base,
          "--color-accent-rgb": hexToRgb(dynamicAccent.base),
          "--color-accent-hover": dynamicAccent.hover,
          "--color-accent-glow": dynamicAccent.glow,
          "--color-accent-contrast": dynamicAccent.contrastText,
          // Sentinel: presence signals "we have a real dynamic accent".
          "--color-accent-resolved": dynamicAccent.base,
          "--color-accent-hover-resolved": dynamicAccent.hover,
          "--color-accent-contrast-resolved": dynamicAccent.contrastText,
        }
      : extractionTimedOut
        ? {
            // Graceful fallback after timeout — use the brand/global accent
            // so the button is never left in its neutral waiting state.
            "--color-accent-resolved": "var(--color-accent)",
            "--color-accent-hover-resolved": "var(--color-accent-hover)",
            "--color-accent-contrast-resolved": "var(--color-accent-contrast)",
          }
        : {}
  ) as React.CSSProperties;

  // Inject the client-side onAlbumArtLoad callback into the (SSR-serialized) config
  const enrichedConfig = useMemo(
    () => ({ ...config, onAlbumArtLoad: handleAlbumArtLoad }),
    [config, handleAlbumArtLoad],
  );

  // Fetch artist data immediately (SSR already rendered the share card)
  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "loading" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    fetchArtistInfo(artistName, userRegion, controller.signal)
      .then((data) => {
        if (!cancelled) dispatch({ type: "done", data });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "done", data: null });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [artistName, userRegion]);

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  return (
    <div style={accentStyle}>
      {onBack && backLabel && (
        <div
          // Width-matched to the desktop card row so the link sits flush with
          // the left edge of the media card; on mobile it sits at the screen's
          // own left gutter.
          className="mx-auto mb-3 min-[1080px]:mb-4"
          style={{ maxWidth: `${MEDIA_W + GAP + ARTIST_W}px` }}
        >
          <BackLink onClick={onBack} label={backLabel} />
        </div>
      )}

      {/* Desktop: beide Cards nebeneinander */}
      <div
        className="hidden min-[1080px]:flex items-start gap-6 mx-auto"
        style={{ width: `${MEDIA_W + GAP + ARTIST_W}px` }}
      >
        <div style={{ width: `${MEDIA_W}px`, flexShrink: 0 }}>
          <SharePageCard config={enrichedConfig} animated={animated} />
        </div>
        <div style={{ width: `${ARTIST_W}px`, flexShrink: 0 }}>
          <ArtistInfoCard data={artistData} isLoading={isLoading} userRegion={userRegion} />
        </div>
      </div>

      {/* Mobile: nur MediaCard + Button für BottomSheet */}
      <div className="block min-[1080px]:hidden">
        <SharePageCard config={enrichedConfig} animated={animated} />
        <div className="mt-3 flex justify-center">
          <EmbossedButton
            as="button"
            type="button"
            onClick={openSheet}
            className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm text-text-primary"
          >
            <UserIcon size={15} weight="duotone" />
            {t("artist.mobileButton")}
          </EmbossedButton>
        </div>
      </div>

      {/* Bottom Sheet (mobile) — portalled to document.body to escape any
          ancestor containing-block breaker (transform / filter /
          will-change / contain). DeferredShareContent wraps this component
          in `animate-slide-up will-change-transform`, which would otherwise
          turn the sheet's `fixed inset-0` into a box relative to that
          wrapper and leave part of the sheet visible below the viewport. */}
      {mounted &&
        createPortal(
          <div style={accentStyle}>
            <div
              className={cn(
                "fixed inset-0 z-50 flex flex-col justify-end",
                sheetOpen ? "pointer-events-auto" : "pointer-events-none",
              )}
            >
              <div
                className={cn(
                  "absolute inset-0 transition-all duration-300",
                  sheetOpen ? "bg-black/70 backdrop-blur-lg" : "bg-black/0 backdrop-blur-none",
                )}
                onClick={closeSheet}
                aria-hidden="true"
              />
              <div
                className={cn(
                  "relative z-10 rounded-t-[36px] bg-surface-elevated shadow-2xl max-h-[85dvh] flex flex-col",
                  "transition-transform duration-300 ease-out",
                  sheetOpen ? "translate-y-0" : "translate-y-full",
                )}
              >
                <div className="flex items-center justify-between px-5 pt-3 pb-2 flex-shrink-0">
                  <div className="w-8" />
                  <div className="h-1 w-10 rounded-full bg-[var(--border)]" />
                  <button
                    type="button"
                    onClick={closeSheet}
                    className="size-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-text-secondary hover:bg-white/[0.12] hover:text-text-primary transition-colors"
                    aria-label={t("artist.closeInfo")}
                  >
                    <XIcon size={16} weight="duotone" />
                  </button>
                </div>
                <div className="overflow-y-auto px-3 pb-8">
                  <ArtistInfoCard data={artistData} isLoading={isLoading} userRegion={userRegion} />
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
