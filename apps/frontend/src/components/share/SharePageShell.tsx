import { type MouseEvent, useCallback, useEffect, useRef } from "react";
import { ShareLayout } from "@/components/share/ShareLayout";
import { LogoView } from "@/components/ui/LogoView";
import type { ShareContentConfiguration } from "@/lib/types/media-card";

interface SharePageShellProps {
  config: ShareContentConfiguration;
  artistName: string;
  initialLocale?: string;
}

export function SharePageShell({ config, artistName, initialLocale }: SharePageShellProps) {
  const navigated = useRef(false);

  const navigateHome = useCallback(() => {
    if (navigated.current) return;
    navigated.current = true;
    try {
      window.sessionStorage.setItem("mc:focusHero", "1");
    } catch {
      // sessionStorage can be unavailable in private or locked-down contexts.
    }
    window.location.assign("/");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      navigateHome();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigateHome]);

  const handleLogoClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigateHome();
    },
    [navigateHome],
  );

  return (
    <main id="main-content" className="flex-1 flex flex-col items-center px-4 sm:px-6 pt-10 sm:pt-12 md:pt-14 pb-12">
      <div className="mb-6 text-center">
        <a href="/" aria-label="Go to musiccloud home" className="inline-block" onClick={handleLogoClick}>
          <LogoView className="w-56 sm:w-64 h-auto" />
        </a>
      </div>
      <div className="animate-fade-in">
        <ShareLayout config={config} artistName={artistName} initialLocale={initialLocale} />
      </div>
    </main>
  );
}
