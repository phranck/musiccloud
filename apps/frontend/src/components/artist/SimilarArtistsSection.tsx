import type { SimilarArtistTrack } from "@musiccloud/shared";
import { ArtistPanelList } from "@/components/artist/ArtistPanelList";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { PopularTrack } from "@/components/artist/PopularTrack";
import { PagedListFooter } from "@/components/ui/PagedListFooter";
import { usePagedList } from "@/hooks/usePagedList";
import { CardSignal } from "@/lib/analytics/umami";

interface SimilarArtistsSectionProps {
  similarArtistTracks: SimilarArtistTrack[];
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  onResolveStart?: () => void;
}

type ResolvedSimilarArtist = SimilarArtistTrack & { track: NonNullable<SimilarArtistTrack["track"]> };

function hasTrack(entry: SimilarArtistTrack): entry is ResolvedSimilarArtist {
  return entry.track != null;
}

/**
 * Renders similar tracks (from other artists) as {@link PopularTrack} rows,
 * capped at six per page with a Previous/Next footer when there are more. Only
 * entries whose track actually resolved are shown — a name-only row is a dead
 * end. Page state lives in this section (isolated from the card's `SmoothSwap`
 * key) so paging never re-fires the cross-fade.
 */
export function SimilarArtistsSection({
  similarArtistTracks,
  onTrackResolve,
  onResolveStart,
}: SimilarArtistsSectionProps) {
  // Only surface similar artists for which we actually resolved a playable
  // track. A name-only row is a dead end for the user — nothing to click,
  // nothing to preview — so we drop it instead of rendering an empty button.
  const withTrack = similarArtistTracks.filter(hasTrack);
  const resetKey = withTrack.map((entry) => entry.track.deezerUrl).join("|");
  const { page, pageCount, canGoPrevious, canGoNext, goPrevious, goNext } = usePagedList(withTrack, { resetKey });

  if (withTrack.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <ArtistPanelList frameSelector=".recessed-gradient-border" frameInset={4}>
        {page.map(({ artistName, track }) => (
          <PopularTrack
            key={`${artistName}:${track.deezerUrl}`}
            cardSignal={CardSignal.SimilarArtist}
            track={track}
            artistLabel={artistName}
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
