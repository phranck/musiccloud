import { lazy, type MouseEvent, type RefObject } from "react";
import { ShareResultFrame } from "@/components/landing/ShareResultFrame";
import { loadShareLayout } from "@/lib/preload/resultRuntime";
import type { ShareArtistInfoContext } from "@/lib/share/share-view";
import type { ShareContentConfiguration } from "@/lib/types/media-card";

// Lazy-loaded share UI — only pulled into the bundle when a result is shown.
const ShareLayout = lazy(loadShareLayout);

interface ShareResultProps {
  activeArtistName: string;
  activeShareConfig: ShareContentConfiguration;
  artistInfoContext?: ShareArtistInfoContext;
  backLabel?: string;
  canGoBack: boolean;
  handleBack: () => void;
  /**
   * Fires once when the clearing slide-out has finished (or immediately on
   * the reduced-motion path) and hands over to the search-field return
   * staging — see `useSearchFieldReturn`.
   */
  onClearSlideOutComplete: () => void;
  handleShareLogoClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  isClearing: boolean;
  resultsPanelRef: RefObject<HTMLDivElement | null>;
}

/**
 * Renders the resolved commercial share result inside the shared
 * {@link ShareResultFrame} (results panel + logo home link + clearing
 * slide-out). The frame wraps the lazily loaded {@link ShareLayout}, which gets
 * the resolved config, artist name, optional back link, and artist-info context.
 *
 * @param activeArtistName - Artist name driving the shared artist column.
 * @param activeShareConfig - The resolved media-card configuration.
 * @param artistInfoContext - Optional context that seeds the artist-info fetch.
 * @param backLabel - Translated label for the back link (used when `canGoBack`).
 * @param canGoBack - Whether a genre-search screen is on the navigation stack.
 * @param handleBack - Pops the navigation stack back to the genre-search results.
 * @param onClearSlideOutComplete - Slide-out completion callback for the frame.
 * @param handleShareLogoClick - Home-link handler (begins the clear/return flow).
 * @param isClearing - Whether the clearing slide-out is running.
 * @param resultsPanelRef - Focus / slide-out target ref.
 */
export function ShareResult({
  activeArtistName,
  activeShareConfig,
  artistInfoContext,
  backLabel,
  canGoBack,
  handleBack,
  onClearSlideOutComplete,
  handleShareLogoClick,
  isClearing,
  resultsPanelRef,
}: ShareResultProps) {
  return (
    <ShareResultFrame
      resultsPanelRef={resultsPanelRef}
      handleShareLogoClick={handleShareLogoClick}
      isClearing={isClearing}
      onClearSlideOutComplete={onClearSlideOutComplete}
    >
      <ShareLayout
        config={activeShareConfig}
        artistName={activeArtistName}
        artistInfoContext={artistInfoContext}
        onBack={canGoBack ? handleBack : undefined}
        backLabel={canGoBack ? backLabel : undefined}
      />
    </ShareResultFrame>
  );
}
