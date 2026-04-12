import type { SimilarArtistTrack } from "@musiccloud/shared";
import { PopularTrack } from "@/components/share/PopularTracksSection";
import { SectionHeading } from "@/components/share/SectionHeading";

interface SimilarArtistsSectionProps {
  similarArtistTracks: SimilarArtistTrack[];
  t: (key: string, vars?: Record<string, string>) => string;
}

export function SimilarArtistsSection({ similarArtistTracks, t }: SimilarArtistsSectionProps) {
  return (
    <div>
      <SectionHeading>{t("artist.similarArtists")}</SectionHeading>
      <div className="flex flex-col gap-2">
        {similarArtistTracks.map(({ artistName, track }) =>
          track ? (
            <PopularTrack key={artistName} track={track} t={t} artistLabel={artistName} />
          ) : (
            <p key={artistName} className="text-sm text-text-primary px-2">
              {artistName}
            </p>
          ),
        )}
      </div>
    </div>
  );
}
