import { CcTracksCard } from "@/components/cards/CcTracksCard";
import { MediaSummaryCard } from "@/components/cards/MediaSummaryCard";
import { ARTIST_W, MEDIA_W, TwoColumnResultGrid } from "@/components/share/TwoColumnResultGrid";
import { buildCcEntityHeaderConfig } from "@/lib/resolve/parsers";
import type { CcEntityTrack } from "@/lib/types/app";

interface CcEntityLayoutProps {
  /** Cover (album) or avatar (artist) image URL for the left media card. */
  artworkUrl: string;
  /** Header primary line: album title or artist name. */
  title: string;
  /** Header secondary line — album shows the artist name; artist leaves it empty. */
  subtitle?: string;
  /** Pre-built header meta line (e.g. "2021"). */
  metaLine?: string;
  /** musiccloud short URL backing the header's share button. */
  shortUrl: string;
  /** Clickable track rows: an album's tracks or an artist's top tracks. */
  tracks: CcEntityTrack[];
  /** Pre-translated track-list section title (e.g. "Tracks (12)"). */
  tracksLabel: string;
  /** Pre-translated empty-state line. */
  emptyLabel: string;
  /** Resolves a clicked track row's candidate id to the CC track page. */
  onSelectTrack: (candidateId: string) => Promise<void>;
}

/**
 * CC album / artist result view, laid out exactly like the commercial share
 * result: a left cover/player media card and a right info column, in the shared
 * {@link TwoColumnResultGrid} (two 512px tracks at `min-[1080px]`, single column
 * below). For CC the right column is the entity's own track list
 * ({@link CcTracksCard}) where the commercial view places its artist-info column.
 *
 * Nothing here is bespoke chrome: the left card is the shared
 * {@link MediaSummaryCard} (no `previewUrl` → cover + info + share, no player),
 * the grid is the shared layout primitive, and the right card reuses the
 * commercial track-row list. Both children render once for desktop (grid) and
 * once for the &lt;1080px single column, mirroring `ShareLayout`'s desktop/mobile
 * split.
 *
 * @param props - See {@link CcEntityLayoutProps}.
 */
export function CcEntityLayout({
  artworkUrl,
  title,
  subtitle,
  metaLine,
  shortUrl,
  tracks,
  tracksLabel,
  emptyLabel,
  onSelectTrack,
}: CcEntityLayoutProps) {
  const header = (
    <MediaSummaryCard
      content={buildCcEntityHeaderConfig({ title, artist: subtitle ?? "", artworkUrl, metaLine, shortUrl })}
    />
  );
  const trackList = (
    <CcTracksCard tracks={tracks} title={tracksLabel} emptyLabel={emptyLabel} onSelectTrack={onSelectTrack} />
  );

  return (
    <>
      <TwoColumnResultGrid
        left={
          <div className="flex flex-col gap-[var(--mc-gap-cards,1.5rem)]" style={{ width: `${MEDIA_W}px` }}>
            {header}
          </div>
        }
        right={<div style={{ width: `${ARTIST_W}px` }}>{trackList}</div>}
      />
      <div className="mx-auto flex w-full max-w-[512px] flex-col gap-[var(--mc-gap-cards,1.5rem)] min-[1080px]:hidden">
        {header}
        {trackList}
      </div>
    </>
  );
}
