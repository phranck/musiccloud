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

type ArtistState = { isLoading: boolean; artistData: ArtistInfoResponse | null };
type ArtistAction = { type: "loading" } | { type: "done"; data: ArtistInfoResponse | null };

function artistReducer(_: ArtistState, action: ArtistAction): ArtistState {
  if (action.type === "loading") return { isLoading: true, artistData: null };
  return { isLoading: false, artistData: action.data };
}

import { ArtistInfoCard } from "@/components/share/ArtistInfoCard";
import { SharePageCard } from "@/components/share/SharePageCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useAlbumColors } from "@/hooks/useAlbumColors";
import { LocaleProvider, useT } from "@/i18n/context";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";

// Convert hex color to RGB string (e.g. "#FF5733" -> "255 87 51")
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "40 168 216"; // fallback to default blue
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `${r} ${g} ${b}`;
}

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
  "Asia/Singapore": "SG",
  "Asia/Dubai": "AE",
  "Asia/Kolkata": "IN",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
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

interface ShareLayoutProps {
  config: MediaCardContentConfiguration;
  artistName: string;
  animated?: boolean;
  initialLocale?: string;
}

export function ShareLayout({ initialLocale, ...props }: ShareLayoutProps) {
  return (
    <LocaleProvider initialLocale={initialLocale as import("@/i18n/locales").Locale | undefined}>
      <ShareLayoutInner {...props} />
    </LocaleProvider>
  );
}

function ShareLayoutInner({ config, artistName, animated = false }: ShareLayoutProps) {
  const t = useT();
  // Detect region synchronously on first render (client-only, Astro island)
  const [userRegion] = useState(detectRegion);
  const [{ isLoading, artistData }, dispatch] = useReducer(artistReducer, {
    isLoading: true,
    artistData: null,
  });
  const [sheetOpen, setSheetOpen] = useState(false);

  // Dynamic accent color extraction from album artwork.
  // `--accent-ready` acts as a boolean gate for elements that should only
  // appear once the dynamic accent has been computed — prevents the brief
  // flash of the default global accent on page load.
  const { dynamicAccent, handleAlbumArtLoad } = useAlbumColors();
  const accentStyle = {
    "--accent-ready": dynamicAccent ? "1" : "0",
    ...(dynamicAccent && {
      "--color-accent": dynamicAccent.base,
      "--color-accent-rgb": hexToRgb(dynamicAccent.base),
      "--color-accent-hover": dynamicAccent.hover,
      "--color-accent-glow": dynamicAccent.glow,
      "--color-accent-contrast": dynamicAccent.contrastText,
    }),
  } as React.CSSProperties;

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
    const params = new URLSearchParams({ name: artistName });
    if (userRegion) params.set("region", userRegion);
    fetch(`${ENDPOINTS.frontend.artistInfo}?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<ArtistInfoResponse>) : null))
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
    };
  }, [artistName, userRegion]);

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  return (
    <div style={accentStyle}>
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

      {/* Bottom Sheet (mobile) */}
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
          {/* Fixed header with handle and close button */}
          <div className="flex items-center justify-between px-5 pt-3 pb-2 flex-shrink-0">
            <div className="w-8" />
            <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
            <button
              type="button"
              onClick={closeSheet}
              className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-text-secondary hover:bg-white/[0.12] hover:text-text-primary transition-colors"
              aria-label={t("artist.closeInfo")}
            >
              <XIcon size={16} weight="duotone" />
            </button>
          </div>
          {/* Scrollable content */}
          <div className="overflow-y-auto px-3 pb-8">
            <ArtistInfoCard data={artistData} isLoading={isLoading} userRegion={userRegion} />
          </div>
        </div>
      </div>
    </div>
  );
}
