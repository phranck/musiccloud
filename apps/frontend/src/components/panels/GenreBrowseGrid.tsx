import type { ApiGenreTile } from "@musiccloud/shared";
import { forwardRef } from "react";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { LazyGenreArtwork } from "@/components/ui/LazyGenreArtwork";
import { useT } from "@/i18n/context";

// Whitelist for backend-provided accent colors that end up as a scoped
// `--color-accent` CSS variable on the tile. CSS custom properties are
// late-resolved; feeding arbitrary backend strings in would let a
// compromised accent leak into any downstream `var()` consumer.
const SAFE_COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\))$/i;
function safeAccent(color: string | undefined): string | undefined {
  if (!color) return undefined;
  return SAFE_COLOR_RE.test(color.trim()) ? color.trim() : undefined;
}

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
      <EmbossedCard className="flex flex-col max-h-[calc(100vh-16rem)]">
        <EmbossedCard.Header className="text-center mb-4 flex-shrink-0">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">{t("genreBrowse.title")}</h2>
          <p className="text-sm text-text-secondary mt-1">{t("genreBrowse.subtitle")}</p>
        </EmbossedCard.Header>

        <EmbossedCard.Body className="flex-1 min-h-0 flex flex-col">
          <RecessedCard className="max-h-full min-h-0 flex flex-col">
            <RecessedCard.Body
              scrollable
              className="rounded-xl grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5"
            >
              {genres.map((genre, i) => {
                // When the artwork has been generated at least once, the
                // backend inlines its dominant accent; apply it as a scoped
                // CSS variable so every `var(--color-accent)` consumer inside
                // the tile (border, glow, hover) picks it up automatically.
                const accent = safeAccent(genre.accentColor);
                const tileStyle = {
                  animationDelay: `${Math.min(i * 30, 600)}ms`,
                  ...(accent ? { ["--color-accent" as string]: accent } : {}),
                } as React.CSSProperties;

                return (
                  <div key={genre.name} className="animate-slide-up aspect-square flex" style={tileStyle}>
                    <EmbossedButton
                      as="button"
                      type="button"
                      noScale
                      onClick={() => onSelect(genre.name)}
                      className="w-full h-full rounded-xl p-0 overflow-hidden"
                      aria-label={`Search ${genre.displayName}`}
                    >
                      <LazyGenreArtwork url={genre.artworkUrl} />
                    </EmbossedButton>
                  </div>
                );
              })}
            </RecessedCard.Body>
          </RecessedCard>
        </EmbossedCard.Body>
      </EmbossedCard>
    </div>
  );
});
