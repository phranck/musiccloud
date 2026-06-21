import type { ArtistTopTrack } from "@musiccloud/shared";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { ArtistPanelList } from "@/components/artist/ArtistPanelList";
import { PopularTrack } from "@/components/artist/PopularTrack";
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
 * Renders a list of {@link PopularTrack} rows inside a grouped-corner
 * {@link ArtistPanelList}. Pure presentation — it maps the provided tracks to
 * rows and forwards the resolve handlers; it owns no data fetching or paging.
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
