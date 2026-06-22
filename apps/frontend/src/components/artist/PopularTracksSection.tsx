import type { ArtistTopTrack } from "@musiccloud/shared";
import { ArtistPanelList } from "@/components/artist/ArtistPanelList";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { PopularTrack } from "@/components/artist/PopularTrack";
import { CardSignal } from "@/lib/analytics/umami";

interface PopularTracksSectionProps {
  /** Analytics signal forwarded to each rendered {@link PopularTrack} row. */
  cardSignal?: string;
  /** The tracks to render, one {@link PopularTrack} row each (already paged by the card). */
  tracks: ArtistTopTrack[];
  /** In-place resolve handler forwarded to every row. */
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  /** Optional callback fired right before a row begins resolving. */
  onResolveStart?: () => void;
}

/**
 * Renders the given tracks as {@link PopularTrack} rows inside a grouped-corner
 * {@link ArtistPanelList}. Pure presentation — the owning card handles the 6-per
 * paging and renders the pager in its footer; this section just maps the rows.
 */
export function PopularTracksSection({
  cardSignal = CardSignal.PopularTrack,
  tracks,
  onTrackResolve,
  onResolveStart,
}: PopularTracksSectionProps) {
  return (
    <ArtistPanelList frameSelector=".recessed-gradient-border" frameInset={4}>
      {tracks.map((track) => (
        <PopularTrack
          key={track.deezerUrl}
          cardSignal={cardSignal}
          track={track}
          onTrackResolve={onTrackResolve}
          onResolveStart={onResolveStart}
        />
      ))}
    </ArtistPanelList>
  );
}
