import type { ArtistTopTrack } from "@musiccloud/shared";
import { ArtistCardShell } from "@/components/artist/ArtistCardParts";
import { PopularTracksSection } from "@/components/artist/PopularTracksSection";
import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import type { CcEntityTrack } from "@/lib/types/app";

/**
 * Maps a CC entity track to the {@link ArtistTopTrack} shape the commercial
 * track-row list ({@link PopularTracksSection}) consumes. The `deezerUrl` slot
 * carries the `jamendo:<id>` candidate id — the section uses that field only as
 * the row key and resolve payload, both intercepted via `onTrackResolve`, so no
 * schema change or second track type is needed. `albumName` is left null: every
 * row in a CC album/artist view shares the entity's artist (named in the header),
 * matching the commercial popular-tracks rows which also show no per-row artist.
 *
 * @param track - A CC album track / artist top track.
 * @returns The track in the shape the shared row list consumes.
 */
function ccEntityTrackToTopTrack(track: CcEntityTrack): ArtistTopTrack {
  return {
    title: track.title,
    artists: [track.artist],
    albumName: null,
    artworkUrl: track.artworkUrl,
    durationMs: track.durationMs ?? null,
    deezerUrl: track.candidateId,
    shortId: null,
  };
}

interface CcTracksCardProps {
  /** The CC album tracks / artist top tracks. */
  tracks: CcEntityTrack[];
  /** Pre-translated section title (e.g. "Tracks (12)" / "Top Tracks (20)"). */
  title: string;
  /** Pre-translated empty-state line. */
  emptyLabel: string;
  /** Resolves a clicked row's candidate id to the CC track page. */
  onSelectTrack: (candidateId: string) => Promise<void>;
}

/**
 * CC album/artist track-list card — the right column of the CC result view.
 *
 * Mirrors the commercial {@link PopularTracksCard} verbatim: an `ArtistCardShell`
 * header + recessed well + the shared `PopularTracksSection` rows (artwork +
 * title + duration + in-place resolve spinner). The CC track list is therefore
 * the exact same row component the commercial artist column uses, not a bespoke
 * list. No skeleton / `SmoothSwap` gating — CC tracks arrive already resolved
 * with the entity, so there is no async fetch to mask.
 *
 * @param tracks - The CC album tracks / artist top tracks.
 * @param title - Pre-translated section title.
 * @param emptyLabel - Pre-translated empty-state line.
 * @param onSelectTrack - Resolves a clicked row's candidate id to the track page.
 */
export function CcTracksCard({ tracks, title, emptyLabel, onSelectTrack }: CcTracksCardProps) {
  return (
    <ArtistCardShell title={title}>
      <div className="px-3 pt-0 pb-3">
        <RecessedCard className={recessedControlInsetClassName}>
          <RecessedCard.Body>
            {tracks.length === 0 ? (
              <p className="py-2 text-center text-sm text-text-muted">{emptyLabel}</p>
            ) : (
              <PopularTracksSection
                tracks={tracks.map(ccEntityTrackToTopTrack)}
                onTrackResolve={(track) => onSelectTrack(track.deezerUrl)}
              />
            )}
          </RecessedCard.Body>
        </RecessedCard>
      </div>
    </ArtistCardShell>
  );
}
