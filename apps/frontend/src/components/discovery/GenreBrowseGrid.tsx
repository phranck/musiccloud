import type { ApiGenreTile } from "@musiccloud/shared";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { GenrePanelShell } from "@/components/discovery/GenrePanelShell";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { LazyGenreArtwork } from "@/components/ui/LazyGenreArtwork";
import { useT } from "@/i18n/localeContext";
import { safeCssColor } from "@/lib/platform/cssColor";

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
 * Grid of genre tiles, shown when the user submits `genre:?`. Clicking a tile
 * triggers a full `genre:<name>` search via the parent's submit handler. Every
 * tile carries procedurally generated artwork with the genre name baked into
 * the image, so no separate text label is rendered.
 *
 * The panel chrome (fade-in, headline, scroll-capped embossed card) comes from
 * the shared {@link GenrePanelShell}.
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
    <GenrePanelShell
      title={t("genreBrowse.title")}
      subtitle={t("genreBrowse.subtitle")}
      maxWidthClass="md:max-w-5xl"
      bodyClassName="flex flex-col"
    >
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
            const accent = safeCssColor(genre.accentColor);
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
    </GenrePanelShell>
  );
}
