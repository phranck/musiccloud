import type { ApiGenreTile } from "@musiccloud/shared";
import { forwardRef } from "react";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useT } from "@/i18n/context";

interface GenreBrowseGridProps {
  genres: ApiGenreTile[];
  onSelect: (genreName: string) => void;
}

/**
 * Grid of popular genre tiles with album-cover thumbnails.
 * Shown when the user submits `genre:?`. Clicking a tile triggers
 * a full `genre:<name>` search via the parent's submit handler.
 */
export const GenreBrowseGrid = forwardRef<HTMLDivElement, GenreBrowseGridProps>(function GenreBrowseGrid(
  { genres, onSelect },
  ref,
) {
  const t = useT();

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="w-full max-w-full md:max-w-5xl mx-auto mt-8 mb-8 animate-fade-in focus:outline-none"
    >
      <EmbossedCard className="rounded-2xl p-5 flex flex-col max-h-[calc(100vh-16rem)]">
        <div className="text-center mb-4 flex-shrink-0">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">{t("genreBrowse.title")}</h2>
          <p className="text-sm text-text-secondary mt-1">{t("genreBrowse.subtitle")}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 flex-1 min-h-0 overflow-y-auto">
          {genres.map((genre, i) => (
            <div key={genre.name} className="animate-slide-up" style={{ animationDelay: `${Math.min(i * 30, 600)}ms` }}>
              <EmbossedButton
                as="button"
                type="button"
                noScale
                onClick={() => onSelect(genre.name)}
                className="w-full rounded-xl p-0 overflow-hidden flex flex-col items-stretch"
                aria-label={`Search ${genre.displayName}`}
              >
                <div className="aspect-square w-full bg-surface-elevated overflow-hidden">
                  {genre.imageUrl ? (
                    <img
                      src={genre.imageUrl}
                      alt=""
                      width={300}
                      height={300}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = "/og/default.jpg";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-2xl text-text-muted">🎵</span>
                    </div>
                  )}
                </div>
                <div className="px-2 py-2 text-center">
                  <p
                    className="text-sm uppercase tracking-widest text-text-primary font-bold truncate"
                    style={{ fontFamily: "var(--font-condensed)" }}
                  >
                    {genre.displayName}
                  </p>
                </div>
              </EmbossedButton>
            </div>
          ))}
        </div>
      </EmbossedCard>
    </div>
  );
});
