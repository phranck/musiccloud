import type { ArtistTopTrack } from "@musiccloud/shared";
import { ArtistPanelList } from "@/components/artist/ArtistPanelList";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { PopularTrack } from "@/components/artist/PopularTrack";
import { PagedListFooter } from "@/components/ui/PagedListFooter";
import { usePagedList } from "@/hooks/usePagedList";
import { CardSignal } from "@/lib/analytics/umami";

interface PopularTracksSectionProps {
  /** Analytics signal forwarded to each rendered {@link PopularTrack} row. */
  cardSignal?: string;
  /** The tracks to render, one {@link PopularTrack} row each. */
  tracks: ArtistTopTrack[];
  /** In-place resolve handler forwarded to every row. */
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  /** Optional callback fired right before a row begins resolving. */
  onResolveStart?: () => void;
}

/**
 * Renders the popular tracks as {@link PopularTrack} rows inside a
 * grouped-corner {@link ArtistPanelList}, capped at six per page with a
 * Previous/Next footer when there are more. The page state lives in this
 * section (not in the card's `SmoothSwap` key), so paging never re-fires the
 * card cross-fade; switching to a new artist resets to the first page via the
 * list-identity reset key. Pure presentation — no data fetching.
 */
export function PopularTracksSection({
  cardSignal = CardSignal.PopularTrack,
  tracks,
  onTrackResolve,
  onResolveStart,
}: PopularTracksSectionProps) {
  const resetKey = tracks.map((track) => track.deezerUrl).join("|");
  const { page, pageCount, canGoPrevious, canGoNext, goPrevious, goNext } = usePagedList(tracks, { resetKey });

  return (
    <div className="flex flex-col gap-3">
      <ArtistPanelList frameSelector=".recessed-gradient-border" frameInset={4}>
        {page.map((track) => (
          <PopularTrack
            key={track.deezerUrl}
            cardSignal={cardSignal}
            track={track}
            onTrackResolve={onTrackResolve}
            onResolveStart={onResolveStart}
          />
        ))}
      </ArtistPanelList>
      <PagedListFooter
        pageCount={pageCount}
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        onPrevious={goPrevious}
        onNext={goNext}
      />
    </div>
  );
}
