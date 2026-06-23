import { lazy, type MouseEvent, type RefObject, useMemo } from "react";
import { ShareResultFrame } from "@/components/landing/ShareResultFrame";
import { loadShareLayout } from "@/lib/preload/resultRuntime";
import { ccResultToShareProps } from "@/lib/resolve/parsers";
import { ccTrackResolver } from "@/lib/resolve/track-resolver";
import type { CcResult } from "@/lib/types/app";

// Lazy-loaded share UI — only pulled into the bundle when a result is shown.
const ShareLayout = lazy(loadShareLayout);

type CcViewTFunc = (key: string, vars?: Record<string, string>) => string;

interface CcShareResultProps {
  ccActive: CcResult;
  handleShareLogoClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  resultsPanelRef: RefObject<HTMLDivElement | null>;
  canGoBack: boolean;
  handleBack: () => void;
  t: CcViewTFunc;
}

/**
 * Renders any resolved Creative-Commons entity (track, album or artist) through
 * the SAME {@link ShareLayout} as the commercial result — only the data source
 * differs. CC supplies a Jamendo-built `artistData` for album/artist (a track
 * loads its column async via `config.ccJamendoArtistId`) and resolves clicked
 * rows in place through {@link ccTrackResolver}. The license card (carried on the
 * config), Back button, popular/similar-track column and two-column layout all
 * come for free.
 *
 * @param ccActive - The resolved CC entity from app state.
 * @param handleShareLogoClick - Home-link handler (begins the clear/return flow).
 * @param resultsPanelRef - Focus target so keyboard users land on the result.
 * @param canGoBack - Whether a genre-search screen is on the navigation stack.
 * @param handleBack - Pops the navigation stack back to the genre-search results.
 * @param t - Translation function.
 */
export function CcShareResult({
  ccActive,
  handleShareLogoClick,
  resultsPanelRef,
  canGoBack,
  handleBack,
  t,
}: CcShareResultProps) {
  const { config, artistName } = ccResultToShareProps(ccActive, t);
  // CC shows similar TRACKS (from other artists), not similar artists, so the
  // shared card gets a CC-specific title; the profile credit names Jamendo (the
  // CC data source). The other titles keep the commercial defaults.
  const ccArtistLabels = useMemo(
    () => ({ similar: t("artist.similarTracks"), profileProvidedBy: t("artist.profileProvidedByJamendo") }),
    [t],
  );
  return (
    <ShareResultFrame resultsPanelRef={resultsPanelRef} handleShareLogoClick={handleShareLogoClick}>
      <ShareLayout
        config={config}
        artistName={artistName}
        artistData={ccActive.artistInfo}
        skipArtistFetch={!config.ccJamendoArtistId}
        labels={ccArtistLabels}
        trackResolver={ccTrackResolver}
        onBack={canGoBack ? handleBack : undefined}
        backLabel={canGoBack ? t("genreSearch.backToResults") : undefined}
      />
    </ShareResultFrame>
  );
}
