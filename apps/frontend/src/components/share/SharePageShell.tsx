import { navigate } from "astro:transitions/client";
import { type MouseEvent, useCallback, useRef } from "react";
import { type ArtistInfoContext, ShareLayout } from "@/components/share/ShareLayout";
import { ShareLogoHeader } from "@/components/share/ShareLogoHeader";
import { useOverlayEscape } from "@/hooks/useOverlayEscape";
import type { ShareContentConfiguration } from "@/lib/types/media-card";

interface SharePageShellProps {
  config: ShareContentConfiguration;
  artistName: string;
  artistInfoContext?: ArtistInfoContext;
  initialLocale?: string;
}

export function SharePageShell({ config, artistName, artistInfoContext, initialLocale }: SharePageShellProps) {
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
      {/* `animate-fade-in` stays CSS deliberately (MC-029 Task 2.5 exception):
          this island is client:load inside the server:defer stream, so the
          share enter plays from parse — before hydration. A GSAP entrance
          would delay it and double-play after hydration. */}
      <div className="w-full animate-fade-in">
        <ShareLayout
          config={config}
          artistName={artistName}
          artistInfoContext={artistInfoContext}
          initialLocale={initialLocale}
        />
      </div>
    </main>
  );
}
