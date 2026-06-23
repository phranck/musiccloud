import type { MouseEvent } from "react";
import { LogoView } from "@/components/ui/LogoView";

interface ShareLogoHeaderProps {
  /**
   * Optional click handler for the home link. When given, it typically calls
   * `preventDefault()` and runs an in-page transition (the landing page's
   * clear/return flow or the share-page shell's `astro:transitions` navigate)
   * instead of a full reload. When omitted, the anchor is a plain `href="/"`
   * link — the no-JS / bot fallback path relies on this.
   */
  onLogoClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Centered musiccloud logo that links home, shown above every client-rendered
 * share result (commercial result, CC result, and the direct share-page shell).
 *
 * The anchor keeps its `href="/"` so it works without JavaScript and degrades
 * to a normal navigation; `onLogoClick` lets a hydrated caller intercept the
 * click for an in-page transition. The `aria-label` names the destination for
 * screen readers since the logo image alone is not a clear link label.
 *
 * @param onLogoClick - Optional click interceptor (see {@link ShareLogoHeaderProps}).
 */
export function ShareLogoHeader({ onLogoClick }: ShareLogoHeaderProps) {
  return (
    <div className="mb-4 text-center sm:mb-6">
      <a href="/" aria-label="Go to musiccloud home" className="inline-block" onClick={onLogoClick}>
        <LogoView className="w-56 sm:w-64 h-auto" />
      </a>
    </div>
  );
}
