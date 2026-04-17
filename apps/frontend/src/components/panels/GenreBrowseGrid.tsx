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
 * Grid of popular genre tiles with procedurally generated atmospheric
 * artworks. Shown when the user submits `genre:?`. Clicking a tile
 * triggers a full `genre:<name>` search via the parent's submit handler.
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
        <EmbossedCard.Header className="text-center mb-4 flex-shrink-0">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">{t("genreBrowse.title")}</h2>
          <p className="text-sm text-text-secondary mt-1">{t("genreBrowse.subtitle")}</p>
        </EmbossedCard.Header>

        <EmbossedCard.Body className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 flex-1 min-h-0 overflow-y-auto">
          {genres.map((genre, i) => {
            // When the artwork has been generated at least once, the
            // backend inlines its dominant accent; apply it as a scoped
            // CSS variable so every `var(--color-accent)` consumer inside
            // the tile (border, glow, hover) picks it up automatically.
            const tileStyle = {
              animationDelay: `${Math.min(i * 30, 600)}ms`,
              ...(genre.accentColor ? { ["--color-accent" as string]: genre.accentColor } : {}),
            } as React.CSSProperties;

            return (
              <div key={genre.name} className="animate-slide-up aspect-square" style={tileStyle}>
                <EmbossedButton
                  as="button"
                  type="button"
                  noScale
                  onClick={() => onSelect(genre.name)}
                  className="w-full h-full rounded-xl p-0 overflow-hidden"
                  aria-label={`Search ${genre.displayName}`}
                >
                  <img
                    src={genre.artworkUrl}
                    alt=""
                    width={512}
                    height={512}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.src = "/og/default.jpg";
                    }}
                  />
                </EmbossedButton>
              </div>
            );
          })}
        </EmbossedCard.Body>
      </EmbossedCard>
    </div>
  );
});
