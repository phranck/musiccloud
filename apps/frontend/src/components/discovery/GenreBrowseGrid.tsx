import type { ApiGenreTile } from "@musiccloud/shared";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { FadeInOnMount } from "@/components/ui/FadeInOnMount";
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

/** Per-index `animation-delay` step of the tile entrance in milliseconds. */
const TILE_ENTRANCE_STAGGER_MS = 30;

/**
 * Upper bound for the staggered tile delay in milliseconds, so large genre
 * sets do not trickle in forever.
 */
const TILE_ENTRANCE_DELAY_CAP_MS = 600;

interface GenreBrowseGridProps {
  genres: ApiGenreTile[];
  onSelect: (genreName: string) => void;
}

/**
 * Grid of popular genre tiles with procedurally generated atmospheric
 * artworks. Shown when the user submits `genre:?`. Clicking a tile
 * triggers a full `genre:<name>` search via the parent's submit handler.
 *
 * The panel fades in on mount via {@link FadeInOnMount} (GSAP, one element).
 * The tile entrance deliberately stays CSS (`animate-slide-up` + per-tile
 * `animation-delay`), exempt from the MC-029 GSAP migration: this grid mounts
 * ~250 tiles at once, and a per-target JS tween init reads computed styles
 * inside the React commit — measured as 200+ ms of forced-reflow time and two
 * >50 ms long tasks in the Phase-2 gate. The browser-native animation scales
 * without any main-thread work (exception inventory in
 * `styles/animations.css`).
 */
export function GenreBrowseGrid({ genres, onSelect }: GenreBrowseGridProps) {
  const t = useT();

  return (
    <FadeInOnMount tabIndex={-1} className="w-full max-w-full md:max-w-5xl mx-auto mt-8 mb-8 focus:outline-none">
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
                  animationDelay: `${Math.min(i * TILE_ENTRANCE_STAGGER_MS, TILE_ENTRANCE_DELAY_CAP_MS)}ms`,
                  ...(accent ? { ["--color-accent" as string]: accent } : {}),
                } as React.CSSProperties;

                return (
                  <div key={genre.name} className="animate-slide-up aspect-square flex" style={tileStyle}>
                    <EmbossedButton
                      as="button"
                      type="button"
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
    </FadeInOnMount>
  );
}
