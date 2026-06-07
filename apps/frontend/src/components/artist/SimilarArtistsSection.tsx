import type { SimilarArtistTrack } from "@musiccloud/shared";
import { type ArtistPanelTrackResolveHandler, PopularTrack } from "@/components/artist/PopularTracksSection";
import { MusicInteractionAction } from "@/lib/analytics/umami";

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
    <div className="flex flex-col gap-0.5">
      {withTrack.map(({ artistName, track }) => (
        <PopularTrack
          key={artistName}
          interactionAction={MusicInteractionAction.SimilarArtistClicked}
          track={track}
          artistLabel={artistName}
          onTrackResolve={onTrackResolve}
          onResolveStart={onResolveStart}
        />
      ))}
    </div>
  );
}
