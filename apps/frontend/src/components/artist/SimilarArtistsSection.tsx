import { ArtistPanelList } from "@/components/artist/ArtistPanelList";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { PopularTrack } from "@/components/artist/PopularTrack";
import type { ResolvedSimilarArtist } from "@/components/artist/similarArtistTracks";
import { CardSignal } from "@/lib/analytics/umami";

interface SimilarArtistsSectionProps {
  /** Resolved + already-paged similar entries to render (filter/paging happen in the card). */
  withTrack: ResolvedSimilarArtist[];
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  onResolveStart?: () => void;
}

/**
 * Renders similar tracks (from other artists) as {@link PopularTrack} rows. Pure
 * presentation — the owning card filters to resolved entries, handles the 6-per
 * paging, and renders the pager in its footer; this section just maps the rows.
 */
export function SimilarArtistsSection({ withTrack, onTrackResolve, onResolveStart }: SimilarArtistsSectionProps) {
  return (
    <ArtistPanelList frameSelector=".recessed-gradient-border" frameInset={4}>
      {withTrack.map(({ artistName, track }) => (
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
  );
}
