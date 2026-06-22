import { lazy, type MouseEvent, type RefObject, useMemo } from "react";
import { CcInfoCard } from "@/components/cards/CcInfoCard";
import { ShareResultFrame } from "@/components/landing/ShareResultFrame";
import { loadShareLayout } from "@/lib/preload/resultRuntime";
import { ccResultToShareProps } from "@/lib/resolve/parsers";
import type { CcResult } from "@/lib/types/app";

// Lazy-loaded share UI — only pulled into the bundle when a result is shown.
const ShareLayout = lazy(loadShareLayout);

type CcViewTFunc = (key: string, vars?: Record<string, string>) => string;

interface CcShareResultProps {
  ccActive: CcResult;
  handleSelectCcTrack: (candidateId: string) => Promise<void>;
  handleShareLogoClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  resultsPanelRef: RefObject<HTMLDivElement | null>;
  canGoBack: boolean;
  handleBack: () => void;
  t: CcViewTFunc;
}

/**
 * Renders any resolved Creative-Commons entity (track, album or artist) through
 * the SAME {@link ShareLayout} as the commercial result — only the data source
 * differs. CC supplies a Jamendo-built `artistData` (skipping the commercial
 * artist-info fetch), a CC track-resolve handler, and (for a track) the
 * `CcInfoCard` license/attribution as the secondary card. The Back-to-discovery
 * button, popular/similar-track column and two-column layout all come for free.
 *
 * @param ccActive - The resolved CC entity from app state.
 * @param handleSelectCcTrack - Resolves a clicked popular/similar track row.
 * @param handleShareLogoClick - Home-link handler (begins the clear/return flow).
 * @param resultsPanelRef - Focus target so keyboard users land on the result.
 * @param canGoBack - Whether a genre-search screen is on the navigation stack.
 * @param handleBack - Pops the navigation stack back to the genre-search results.
 * @param t - Translation function.
 */
export function CcShareResult({
  ccActive,
  handleSelectCcTrack,
  handleShareLogoClick,
  resultsPanelRef,
  canGoBack,
  handleBack,
  t,
}: CcShareResultProps) {
  const { config, artistName, ccInfoContent } = ccResultToShareProps(ccActive, t);
  // The secondary card is only present for a CC track (license / attribution).
  // Memoized so its element identity stays stable across re-renders — passing a
  // freshly allocated element into the `secondaryCard` prop each render would
  // otherwise defeat the downstream memoization.
  const secondaryCard = useMemo(
    () => (ccInfoContent ? <CcInfoCard content={ccInfoContent} /> : undefined),
    [ccInfoContent],
  );
  // CC shows similar TRACKS (from other artists), not similar artists, so the
  // shared card gets a CC-specific title; the other three keep the defaults.
  const ccArtistLabels = useMemo(() => ({ similar: t("artist.similarTracks") }), [t]);
  return (
    <ShareResultFrame resultsPanelRef={resultsPanelRef} handleShareLogoClick={handleShareLogoClick}>
      <ShareLayout
        config={config}
        artistName={artistName}
        artistData={ccActive.artistInfo}
        skipArtistFetch
        secondaryCard={secondaryCard}
        labels={ccArtistLabels}
        onTrackResolve={(track) => handleSelectCcTrack(track.deezerUrl)}
        onBack={canGoBack ? handleBack : undefined}
        backLabel={canGoBack ? t("genreSearch.backToResults") : undefined}
      />
    </ShareResultFrame>
  );
}
