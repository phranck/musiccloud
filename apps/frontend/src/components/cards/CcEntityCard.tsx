import { outerEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { MediaSummaryCard } from "@/components/cards/MediaSummaryCard";
import { CandidateRowContent } from "@/components/ui/CandidateRowContent";
import { GenreColumn } from "@/components/ui/GenreColumn";
import { GenreRowButton } from "@/components/ui/GenreRowButton";
import type { CcEntityTrack } from "@/lib/types/app";
import { MediaCardContentTypeValue, type ShareContentConfiguration } from "@/lib/types/media-card";

interface CcEntityCardProps {
  /** Cover (album) or avatar (artist) image URL shown in the header. */
  artworkUrl: string;
  /** Header primary line: album title or artist name. */
  title: string;
  /** Header secondary line — album shows the artist name; artist leaves it empty. */
  subtitle?: string;
  /** Pre-built header meta line (e.g. "2021 · 12 Tracks"). */
  metaLine?: string;
  /** musiccloud short URL backing the header's share button. */
  shortUrl: string;
  /** Clickable track rows: an album's tracks or an artist's top tracks. */
  tracks: CcEntityTrack[];
  /** Pre-translated track-list column label (e.g. "Tracks (12)"). */
  tracksLabel: string;
  /** Pre-translated empty-state line shown when there are no tracks. */
  emptyLabel: string;
  /** Builds a row's accessible label from its title + artist. */
  trackAriaLabel: (title: string, artist: string) => string;
  /** Resolves the clicked row's candidate id to the CC track page. */
  onSelectTrack: (candidateId: string) => void;
}

/**
 * Adapts the entity header fields into the {@link ShareContentConfiguration}
 * shape {@link MediaSummaryCard} consumes. No `previewUrl` is set — an album or
 * artist has no single stream, so the summary card renders cover + info + share
 * button without a player. `type: "share"` wires the share button to `shortUrl`.
 *
 * @param props - Header fields (title, subtitle, artwork, meta, short URL).
 * @returns The summary-card configuration.
 */
function headerConfig(
  props: Pick<CcEntityCardProps, "title" | "subtitle" | "artworkUrl" | "metaLine" | "shortUrl">,
): ShareContentConfiguration {
  return {
    type: MediaCardContentTypeValue.Share,
    title: props.title,
    artist: props.subtitle ?? "",
    artworkUrl: props.artworkUrl,
    metaLine: props.metaLine,
    platforms: [],
    platformsLabel: "",
    platformsLabelKey: "",
    shortUrl: props.shortUrl,
  };
}

/**
 * Shared Creative-Commons album / artist view: an entity header stacked above a
 * clickable track list. Both entities differ only in their header fields and
 * list label, so a single component renders both (KISS/DRY).
 *
 * The header reuses {@link MediaSummaryCard} (cover + info + share button, no
 * player). The track list reuses the genre-search row chrome
 * ({@link GenreColumn} + {@link GenreRowButton} + {@link CandidateRowContent}) so
 * the rows match the discovery list exactly. A row click hands its prebuilt
 * `jamendo:<id>` candidate id back to {@link onSelectTrack}, which resolves it to
 * the CC track page.
 *
 * @param props - See {@link CcEntityCardProps}.
 */
export function CcEntityCard({
  artworkUrl,
  title,
  subtitle,
  metaLine,
  shortUrl,
  tracks,
  tracksLabel,
  emptyLabel,
  trackAriaLabel,
  onSelectTrack,
}: CcEntityCardProps) {
  return (
    <div className="flex flex-col gap-[var(--mc-gap-cards,1.5rem)]">
      <MediaSummaryCard content={headerConfig({ title, subtitle, artworkUrl, metaLine, shortUrl })} />

      <EmbossedCard className={outerEmbossedCardClassName}>
        <EmbossedCard.Body>
          {tracks.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">{emptyLabel}</p>
          ) : (
            <GenreColumn label={tracksLabel}>
              {tracks.map((track, i) => (
                <GenreRowButton
                  key={track.candidateId}
                  index={i}
                  onClick={() => onSelectTrack(track.candidateId)}
                  ariaLabel={trackAriaLabel(track.title, track.artist)}
                >
                  <CandidateRowContent
                    compact
                    artworkUrl={track.artworkUrl}
                    primary={track.title}
                    secondary={track.artist}
                  />
                </GenreRowButton>
              ))}
            </GenreColumn>
          )}
        </EmbossedCard.Body>
      </EmbossedCard>
    </div>
  );
}
