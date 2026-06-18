import type { SimilarArtistTrack } from "@musiccloud/shared";
import { ArtistPanelList } from "@/components/artist/ArtistPanelList";
import { type ArtistPanelTrackResolveHandler, PopularTrack } from "@/components/artist/PopularTracksSection";
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

export function SimilarArtistsSection({
  similarArtistTracks,
  onTrackResolve,
  onResolveStart,
}: SimilarArtistsSectionProps) {
  // Only surface similar artists for which we actually resolved a playable
  // track. A name-only row is a dead end for the user — nothing to click,
  // nothing to preview — so we drop it instead of rendering an empty button.
  const withTrack = similarArtistTracks.filter(hasTrack);

  if (withTrack.length === 0) return null;

  return (
    <ArtistPanelList frameSelector=".recessed-gradient-border" frameInset={4}>
      {withTrack.map(({ artistName, track }) => (
        <PopularTrack
          key={artistName}
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
