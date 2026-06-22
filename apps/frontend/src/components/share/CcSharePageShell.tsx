import { navigate } from "astro:transitions/client";
import type { ArtistInfoResponse, ArtistTopTrack } from "@musiccloud/shared";
import { ENDPOINTS } from "@musiccloud/shared";
import { type MouseEvent, type ReactNode, useCallback, useMemo, useRef } from "react";
import { CcInfoCard } from "@/components/cards/CcInfoCard";
import { ShareLayout } from "@/components/share/ShareLayout";
import { ShareLogoHeader } from "@/components/share/ShareLogoHeader";
import { useOverlayEscape } from "@/hooks/useOverlayEscape";
import { pathFromShortUrl } from "@/lib/share/short-url";
import type { CcTrackContentConfiguration, ShareContentConfiguration } from "@/lib/types/media-card";

interface CcSharePageShellProps {
  /** Left media-card configuration (cover / player) for the CC entity. */
  config: ShareContentConfiguration;
  /** Artist name driving the shared right-hand artist column. */
  artistName: string;
  /** Pre-built Jamendo artist info (popular + similar tracks); no internal fetch. */
  artistInfo: ArtistInfoResponse;
  /** License / attribution content for the `CcInfoCard` secondary slot — track only. */
  ccInfoContent?: CcTrackContentConfiguration;
  /** CC section-title overrides ("Similar Tracks", Jamendo credit). */
  labels: { similar: string; profileProvidedBy: string };
  initialLocale?: string;
}

/**
 * Renders a persistent CC share page (`/:shortId` for a cc-track/cc-album/
 * cc-artist) through the same {@link ShareLayout} as the commercial page and the
 * CC live view — only the data source and the row-resolve behaviour differ.
 *
 * The logo returns home (with focus restored to the hero); Escape does the same.
 * A clicked popular/similar row resolves its `jamendo:<id>` candidate through the
 * CC endpoint and navigates to the freshly minted CC share page, rather than the
 * commercial in-place resolve (whose reducer is commercial-only).
 */
export function CcSharePageShell({
  config,
  artistName,
  artistInfo,
  ccInfoContent,
  labels,
  initialLocale,
}: CcSharePageShellProps) {
  const navigated = useRef(false);

  const navigateHome = useCallback(() => {
    if (navigated.current) return;
    navigated.current = true;
    try {
      window.sessionStorage.setItem("mc:focusHero", "1");
    } catch {
      // sessionStorage can be unavailable in private or locked-down contexts.
    }
    navigate("/");
  }, []);

  useOverlayEscape({ enabled: true, onEscape: navigateHome });

  const handleLogoClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigateHome();
    },
    [navigateHome],
  );

  const handleCcTrackResolve = useCallback(async (track: ArtistTopTrack) => {
    // CC rows carry a `jamendo:<id>` candidate in `deezerUrl`. Resolving it mints
    // + persists a short URL; navigate to that new CC share page.
    const res = await fetch(ENDPOINTS.frontend.ccResolve, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedCandidate: track.deezerUrl }),
    });
    if (!res.ok) throw new Error(`CC resolve failed: ${res.status}`);
    const resolved = (await res.json()) as { shortUrl?: string };
    if (!resolved.shortUrl) throw new Error("CC resolve returned no short URL");
    navigate(pathFromShortUrl(resolved.shortUrl));
  }, []);

  const secondaryCard = useMemo<ReactNode>(
    () => (ccInfoContent ? <CcInfoCard content={ccInfoContent} /> : undefined),
    [ccInfoContent],
  );

  return (
    <main id="main-content" className="flex-1 flex flex-col items-center px-4 sm:px-6 pt-20 sm:pt-12 md:pt-14 pb-12">
      <ShareLogoHeader onLogoClick={handleLogoClick} />
      {/* See SharePageShell: CSS fade is deliberate here (client:load inside a
          server:defer stream plays the enter before hydration). */}
      <div className="w-full animate-fade-in">
        <ShareLayout
          config={config}
          artistName={artistName}
          artistData={artistInfo}
          skipArtistFetch
          secondaryCard={secondaryCard}
          labels={labels}
          onTrackResolve={handleCcTrackResolve}
          initialLocale={initialLocale}
        />
      </div>
    </main>
  );
}
