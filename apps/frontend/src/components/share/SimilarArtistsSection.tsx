import type { SimilarArtistTrack } from "@musiccloud/shared";
import { PopularTrack } from "@/components/share/PopularTracksSection";
import { SectionHeading } from "@/components/share/SectionHeading";
import { EmbossedButton } from "@/components/ui/EmbossedButton";

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
            <PopularTrack key={artistName} track={track} artistLabel={artistName} />
          ) : (
            <EmbossedButton key={artistName} className="w-full rounded-lg px-3 py-2 no-underline">
              <p className="text-sm text-text-primary">{artistName}</p>
            </EmbossedButton>
          ),
        )}
      </div>
    </div>
  );
}
