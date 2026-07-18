import { navigate } from "astro:transitions/client";
import type { ArtistInfoResponse } from "@musiccloud/shared";
import { type MouseEvent, useCallback, useRef } from "react";
import { ShareLayout } from "@/components/share/ShareLayout";
import { ShareLogoHeader } from "@/components/share/ShareLogoHeader";
import { useOverlayEscape } from "@/hooks/useOverlayEscape";
import { ccTrackResolver } from "@/lib/resolve/track-resolver";
import type { ShareContentConfiguration } from "@/lib/types/media-card";

interface CcSharePageShellProps {
  /** Left media-card configuration (cover / player) for the CC entity; a cc-track
   *  config carries its `ccInfoContent` (license card) and `ccJamendoArtistId`. */
  config: ShareContentConfiguration;
  /** Artist name driving the shared right-hand artist column. */
  artistName: string;
  /** Pre-built Jamendo artist column — set for cc-album/cc-artist, **unset for
   *  cc-track** (loaded async via `config.ccJamendoArtistId`). */
  artistInfo?: ArtistInfoResponse;
  /** CC section-title overrides (see `CC_ARTIST_LABELS`). */
  labels: { similar: string; profileProvidedBy: string };
}

/**
 * Renders a persistent CC share page (`/:shortId` for a cc-track/cc-album/
 * cc-artist) through the same {@link ShareLayout} as the commercial page and the
 * CC live view — only the data source differs.
 *
 * The logo returns home (with focus restored to the hero); Escape does the same.
 * A clicked popular/similar row resolves in place through {@link ccTrackResolver}
 * (the same generic mechanism the commercial page uses), so the card swaps
 * without a navigation or re-mount.
 */
export function CcSharePageShell({ config, artistName, artistInfo, labels }: CcSharePageShellProps) {
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

  return (
    <main id="main-content" className="flex-1 flex flex-col items-center px-4 sm:px-6 pt-content-safe pb-12">
      <ShareLogoHeader onLogoClick={handleLogoClick} />
      {/* See SharePageShell: CSS fade is deliberate here (client:load inside a
          server:defer stream plays the enter before hydration). */}
      <div className="w-full animate-fade-in">
        <ShareLayout
          config={config}
          artistName={artistName}
          artistData={artistInfo}
          skipArtistFetch={!config.ccJamendoArtistId}
          labels={labels}
          trackResolver={ccTrackResolver}
        />
      </div>
    </main>
  );
}
