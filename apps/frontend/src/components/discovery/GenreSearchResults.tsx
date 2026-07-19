import { type Ref, useMemo } from "react";
import { GenrePanelShell } from "@/components/discovery/GenrePanelShell";
import { NavigationBackButton } from "@/components/navigation/NavigationBackButton";
import { CancelButton } from "@/components/ui/CancelButton";
import { CandidateRowContent } from "@/components/ui/CandidateRowContent";
import { GenreColumn } from "@/components/ui/GenreColumn";
import { GenreRowButton } from "@/components/ui/GenreRowButton";
import { SlideArtworkKind } from "@/components/ui/SlideArtworkTypes";
import { discoveryCopy } from "@/copy/discovery";
import { buildHeadline } from "@/lib/genre-search/headline";
import type { GenreSearchPayload, GenreSearchResults as GenreSearchResultsData } from "@/lib/types/app";
import { cn } from "@/lib/utils";

interface GenreSearchResultsProps {
  results: GenreSearchResultsData;
  /**
   * Parsed view of the submitted query — used to build the natural-
   * language summary shown as the card's headline.
   */
  queryDetails: GenreSearchPayload["queryDetails"];
  /**
   * Non-fatal parser notes to surface under the results. Typically
   * empty; populated when the parser silently reconciled something
   * the user wrote (e.g. combined `count` and `tracks`).
   */
  warnings?: string[];
  /**
   * Called when the user clicks a result row. The handler feeds the
   * `webUrl` back into the normal resolve flow and gets the row's `id`
   * so the panel can highlight the selected row while that follow-up
   * resolve is in flight.
   */
  onSelect: (webUrl: string, id: string) => void;
  onCancel?: () => void;
  onBack?: () => void;
  /**
   * Id of the row the user just clicked. While `loading` is true, that row
   * swaps its cover for the spinning CD and every row is non-interactive.
   * Same contract as `DisambiguationPanel`.
   */
  selectedId?: string | null;
  loading?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Three-column (desktop) / stacked (mobile) rendering of a genre-search
 * result. Each list is only rendered when the user actually requested
 * that type — the backend sends `null` otherwise.
 *
 * Row visuals come from the shared {@link CandidateRowContent} so the
 * layout matches the disambiguation list: same artwork + text block
 * structure, just in a denser (`compact`) variant.
 *
 * No FLIP animation here — clicks immediately start a follow-up resolve,
 * and the normal loading state covers the transition.
 */
export function GenreSearchResults({
  results,
  queryDetails,
  warnings,
  onSelect,
  onCancel,
  onBack,
  selectedId,
  loading = false,
  ref,
}: GenreSearchResultsProps) {
  const headline = buildHeadline(queryDetails);

  const hasAny =
    (results.tracks && results.tracks.length > 0) ||
    (results.albums && results.albums.length > 0) ||
    (results.artists && results.artists.length > 0);

  const columnCount =
    (results.tracks && results.tracks.length > 0 ? 1 : 0) +
    (results.albums && results.albums.length > 0 ? 1 : 0) +
    (results.artists && results.artists.length > 0 ? 1 : 0);

  // Memoized so the shell's `leadingAddOn` / `footer` slots receive a stable
  // node reference (the `jsx-no-jsx-as-prop` perf rule wants memoized JSX rather
  // than a freshly allocated element on every render).
  const leadingAddOn = useMemo(
    () =>
      onBack ? <NavigationBackButton onClick={onBack} label={discoveryCopy.genreSearch.backToBrowse} /> : undefined,
    [onBack],
  );

  const footer = useMemo(() => {
    const hasWarnings = !!warnings?.length;
    if (!hasWarnings && !onCancel) return undefined;
    return (
      <>
        {warnings && warnings.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs text-text-muted flex-shrink-0" aria-live="polite">
            {warnings.map((w) => (
              <li key={w} className="flex items-start gap-1.5">
                <span aria-hidden="true">⚠</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}

        {onCancel && (
          <div className="text-center mt-4 flex-shrink-0">
            <CancelButton onClick={onCancel}>{discoveryCopy.genreSearch.cancel}</CancelButton>
          </div>
        )}
      </>
    );
  }, [warnings, onCancel]);

  return (
    <GenrePanelShell
      ref={ref}
      title={headline}
      subtitle={discoveryCopy.genreSearch.subtitle}
      maxWidthClass={cn(
        columnCount === 1 && "md:max-w-sm",
        columnCount === 2 && "md:max-w-2xl",
        columnCount >= 3 && "md:max-w-5xl",
      )}
      leadingAddOn={leadingAddOn}
      footer={footer}
    >
      {!hasAny ? (
        <p className="text-center text-sm text-text-muted py-8">{discoveryCopy.genreSearch.empty}</p>
      ) : (
        <div
          className={cn(
            "grid grid-cols-1 gap-4 flex-1 min-h-0",
            columnCount === 2 && "md:grid-cols-2",
            columnCount >= 3 && "md:grid-cols-3",
          )}
        >
          {results.tracks && (
            <GenreColumn label={discoveryCopy.genreSearch.tracks(results.tracks.length)}>
              {results.tracks.map((track, i) => {
                const isSelected = loading && selectedId === track.id;
                return (
                  <GenreRowButton
                    key={track.id}
                    index={i}
                    onClick={() => onSelect(track.webUrl, track.id)}
                    disabled={loading}
                    ariaLabel={
                      isSelected
                        ? discoveryCopy.genreSearch.loading
                        : discoveryCopy.genreSearch.resolveTrack(track.title, track.artists.join(", "))
                    }
                  >
                    <CandidateRowContent
                      compact
                      artworkUrl={track.artworkUrl}
                      slideArtwork
                      slideArtworkActive={isSelected}
                      primary={track.title}
                      secondary={track.artists.join(", ")}
                      tertiary={track.albumName}
                    />
                  </GenreRowButton>
                );
              })}
            </GenreColumn>
          )}

          {results.albums && (
            <GenreColumn label={discoveryCopy.genreSearch.albums(results.albums.length)}>
              {results.albums.map((album, i) => {
                const isSelected = loading && selectedId === album.id;
                return (
                  <GenreRowButton
                    key={album.id}
                    index={i}
                    onClick={() => onSelect(album.webUrl, album.id)}
                    disabled={loading}
                    ariaLabel={
                      isSelected
                        ? discoveryCopy.genreSearch.loading
                        : discoveryCopy.genreSearch.resolveAlbum(album.title, album.artists.join(", "))
                    }
                  >
                    <CandidateRowContent
                      compact
                      artworkUrl={album.artworkUrl}
                      slideArtwork
                      slideArtworkActive={isSelected}
                      primary={album.title}
                      secondary={album.artists.join(", ")}
                    />
                  </GenreRowButton>
                );
              })}
            </GenreColumn>
          )}

          {results.artists && (
            <GenreColumn label={discoveryCopy.genreSearch.artists(results.artists.length)}>
              {results.artists.map((artist, i) => {
                const isSelected = loading && selectedId === artist.id;
                return (
                  <GenreRowButton
                    key={artist.id}
                    index={i}
                    onClick={() => onSelect(artist.webUrl, artist.id)}
                    disabled={loading}
                    ariaLabel={
                      isSelected
                        ? discoveryCopy.genreSearch.loading
                        : discoveryCopy.genreSearch.resolveArtist(artist.name)
                    }
                  >
                    <CandidateRowContent
                      compact
                      artworkUrl={artist.imageUrl}
                      artworkKind={SlideArtworkKind.Round}
                      slideArtwork
                      slideArtworkActive={isSelected}
                      primary={artist.name}
                    />
                  </GenreRowButton>
                );
              })}
            </GenreColumn>
          )}
        </div>
      )}
    </GenrePanelShell>
  );
}
