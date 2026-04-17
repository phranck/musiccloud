import type { SimilarArtistTrack } from "@musiccloud/shared";
import { PopularTrack } from "@/components/share/PopularTracksSection";
import { SectionHeading } from "@/components/share/SectionHeading";

interface SimilarArtistsSectionProps {
  similarArtistTracks: SimilarArtistTrack[];
  t: (key: string, vars?: Record<string, string>) => string;
}

type ResolvedSimilarArtist = SimilarArtistTrack & { track: NonNullable<SimilarArtistTrack["track"]> };

function hasTrack(entry: SimilarArtistTrack): entry is ResolvedSimilarArtist {
  return entry.track != null;
}

export function SimilarArtistsSection({ similarArtistTracks, t }: SimilarArtistsSectionProps) {
  // Only surface similar artists for which we actually resolved a playable
  // track. A name-only row is a dead end for the user — nothing to click,
  // nothing to preview — so we drop it instead of rendering an empty button.
  const withTrack = similarArtistTracks.filter(hasTrack);

  if (withTrack.length === 0) return null;

  return (
    <div>
      <SectionHeading>{t("artist.similarArtists")}</SectionHeading>
      <div className="flex flex-col gap-1.5">
        {withTrack.map(({ artistName, track }) => (
          <PopularTrack key={artistName} track={track} artistLabel={artistName} />
        ))}
      </div>
    </div>
  );
}
