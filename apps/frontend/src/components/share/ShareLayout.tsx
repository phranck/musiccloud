/**
 * ShareLayout
 *
 * Desktop: MediaCard and ArtistInfoCard side-by-side, horizontally centered.
 *          Artist data is fetched immediately on mount.
 *
 * Mobile (< sm): MediaCard only, with a button that opens ArtistInfoCard
 *                as a bottom sheet.
 */

import type { ArtistInfoResponse } from "@musiccloud/shared";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

type ArtistState = { isLoading: boolean; artistData: ArtistInfoResponse | null };
type ArtistAction = { type: "loading" } | { type: "done"; data: ArtistInfoResponse | null };

function artistReducer(_: ArtistState, action: ArtistAction): ArtistState {
  if (action.type === "loading") return { isLoading: true, artistData: null };
  return { isLoading: false, artistData: action.data };
}

import { ArtistInfoCard } from "@/components/share/ArtistInfoCard";
import { SharePageCard } from "@/components/share/SharePageCard";
import { useAlbumColors } from "@/hooks/useAlbumColors";
import { LocaleProvider, useT } from "@/i18n/context";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";

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
}

export function ShareLayout(props: ShareLayoutProps) {
  return (
    <LocaleProvider>
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

  // Dynamic accent color extraction from album artwork
  const { dynamicAccent, handleAlbumArtLoad } = useAlbumColors();
  const accentStyle = dynamicAccent
    ? ({
        "--color-accent": dynamicAccent.base,
        "--color-accent-hover": dynamicAccent.hover,
        "--color-accent-glow": dynamicAccent.glow,
        "--color-accent-contrast": dynamicAccent.contrastText,
      } as React.CSSProperties)
    : undefined;

  // Inject the client-side onAlbumArtLoad callback into the (SSR-serialized) config
  const enrichedConfig = useMemo(
    () => ({ ...config, onAlbumArtLoad: handleAlbumArtLoad }),
    [config, handleAlbumArtLoad],
  );

  // Fetch artist data via Astro proxy (same-origin, no CORS issues)
  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "loading" });
    const params = new URLSearchParams({ name: artistName });
    if (userRegion) params.set("region", userRegion);
    fetch(`/api/artist-info?${params.toString()}`)
      .then((res) => (res.ok ? (res.json() as Promise<ArtistInfoResponse>) : null))
      .then((data) => {
        if (!cancelled) dispatch({ type: "done", data });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "done", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [artistName, userRegion]);

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  return (
    <div style={accentStyle}>
      {/* Desktop: beide Cards nebeneinander */}
      <div className="hidden sm:flex items-start gap-6 mx-auto" style={{ width: `${MEDIA_W + GAP + ARTIST_W}px` }}>
        <div style={{ width: `${MEDIA_W}px`, flexShrink: 0 }}>
          <SharePageCard config={enrichedConfig} animated={animated} />
        </div>
        <div style={{ width: `${ARTIST_W}px`, flexShrink: 0 }}>
          <ArtistInfoCard data={artistData} isLoading={isLoading} userRegion={userRegion} />
        </div>
      </div>

      {/* Mobile: nur MediaCard + Button für BottomSheet */}
      <div className="block sm:hidden">
        <SharePageCard config={enrichedConfig} animated={animated} />
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={openSheet}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--border)] bg-[var(--card)] text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
            </svg>
            {t("artist.mobileButton")}
          </button>
        </div>
      </div>

      {/* Bottom Sheet (mobile) */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeSheet} aria-hidden="true" />
          <div className="relative z-10 rounded-t-3xl bg-[var(--background)] shadow-2xl max-h-[85dvh] overflow-y-auto">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
            </div>
            <div className="px-4 pb-8 pt-2">
              <ArtistInfoCard data={artistData} isLoading={isLoading} userRegion={userRegion} onClose={closeSheet} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
