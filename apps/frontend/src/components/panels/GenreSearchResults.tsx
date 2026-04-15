import { forwardRef } from "react";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { CandidateRowContent } from "@/components/ui/CandidateRowContent";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useT } from "@/i18n/context";
import type { GenreSearchResults as GenreSearchResultsData } from "@/lib/types/app";
import { cn } from "@/lib/utils";

interface GenreSearchResultsProps {
  results: GenreSearchResultsData;
  /**
   * Called when the user clicks a result row. The handler feeds the
   * `webUrl` back into the normal resolve flow so the familiar
   * cross-service result view takes over.
   */
  onSelect: (webUrl: string) => void;
  onCancel?: () => void;
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
export const GenreSearchResults = forwardRef<HTMLDivElement, GenreSearchResultsProps>(function GenreSearchResults(
  { results, onSelect, onCancel },
  ref,
) {
  const t = useT();

  const hasAny =
    (results.tracks && results.tracks.length > 0) ||
    (results.albums && results.albums.length > 0) ||
    (results.artists && results.artists.length > 0);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="w-full max-w-full md:max-w-5xl mx-auto mt-8 animate-fade-in focus:outline-none"
    >
      <EmbossedCard className="rounded-2xl p-5">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">{t("genreSearch.title")}</h2>
          <p className="text-sm text-text-secondary mt-1">{t("genreSearch.subtitle")}</p>
        </div>

        {!hasAny ? (
          <p className="text-center text-sm text-text-muted py-8">{t("genreSearch.empty")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {results.tracks && (
              <Column label={t("genreSearch.tracks", { count: String(results.tracks.length) })}>
                {results.tracks.map((track, i) => (
                  <RowButton
                    key={track.id}
                    index={i}
                    onClick={() => onSelect(track.webUrl)}
                    ariaLabel={`Resolve track "${track.title}" by ${track.artists.join(", ")}`}
                  >
                    <CandidateRowContent
                      compact
                      artworkUrl={track.artworkUrl}
                      primary={track.title}
                      secondary={track.artists.join(", ")}
                      tertiary={track.albumName}
                    />
                  </RowButton>
                ))}
              </Column>
            )}

            {results.albums && (
              <Column label={t("genreSearch.albums", { count: String(results.albums.length) })}>
                {results.albums.map((album, i) => (
                  <RowButton
                    key={album.id}
                    index={i}
                    onClick={() => onSelect(album.webUrl)}
                    ariaLabel={`Resolve album "${album.title}" by ${album.artists.join(", ")}`}
                  >
                    <CandidateRowContent
                      compact
                      artworkUrl={album.artworkUrl}
                      primary={album.title}
                      secondary={album.artists.join(", ")}
                    />
                  </RowButton>
                ))}
              </Column>
            )}

            {results.artists && (
              <Column label={t("genreSearch.artists", { count: String(results.artists.length) })}>
                {results.artists.map((artist, i) => (
                  <RowButton
                    key={artist.id}
                    index={i}
                    onClick={() => onSelect(artist.webUrl)}
                    ariaLabel={`Resolve artist ${artist.name}`}
                  >
                    <CandidateRowContent
                      compact
                      artworkUrl={artist.imageUrl}
                      artworkKind="round"
                      primary={artist.name}
                    />
                  </RowButton>
                ))}
              </Column>
            )}
          </div>
        )}

        {onCancel && (
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                "text-sm text-text-muted hover:text-text-secondary",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:rounded",
              )}
            >
              {t("genreSearch.cancel")}
            </button>
          </div>
        )}
      </EmbossedCard>
    </div>
  );
});

// ─── Internal presentational parts ──────────────────────────────────────────

function Column({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <RecessedCard className="p-2" radius="0.75rem">
      <h3 className="text-xs uppercase tracking-wider text-text-muted font-semibold px-2 pt-1 pb-2">{label}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </RecessedCard>
  );
}

function RowButton({
  index,
  onClick,
  ariaLabel,
  children,
}: {
  index: number;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-slide-up" style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}>
      <EmbossedButton
        as="button"
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 px-2 py-2 text-left rounded-lg"
        aria-label={ariaLabel}
      >
        {children}
      </EmbossedButton>
    </div>
  );
}
