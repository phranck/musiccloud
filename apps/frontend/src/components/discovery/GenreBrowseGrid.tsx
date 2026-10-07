import type { ApiGenreTile } from "@musiccloud/shared";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { GenrePanelShell } from "@/components/discovery/GenrePanelShell";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { LazyGenreArtwork } from "@/components/ui/LazyGenreArtwork";
import { discoveryCopy } from "@/copy/discovery";
import { safeCssColor } from "@/lib/platform/cssColor";

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
 * The grid rises in as one element with the CSS `animate-slide-up`, which the
 * browser runs off the main thread. Tiles rising one by one keep Safari
 * repainting the whole scrolling grid for as long as any tile still moves: 22
 * to 27 dropped frames when the grid opens, against 5 with one rising element
 * (Safari 27, iPad simulator). It stays CSS rather than GSAP,
 * which would drive it from the main thread while the tiles mount (exception
 * inventory in `styles/animations.css`).
 */
export function GenreBrowseGrid({ genres, onSelect }: GenreBrowseGridProps) {
  return (
    <GenrePanelShell
      title={discoveryCopy.genreBrowse.title}
      subtitle={discoveryCopy.genreBrowse.subtitle}
      maxWidthClass="md:max-w-5xl"
      bodyClassName="flex flex-col"
    >
      <RecessedCard className="max-h-full min-h-0 flex flex-col">
        <RecessedCard.Body
          scrollable
          className="animate-slide-up rounded-xl grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5"
        >
          {genres.map((genre) => {
            // When the artwork has been generated at least once, the
            // backend inlines its dominant accent; apply it as a scoped
            // CSS variable so every `var(--color-accent)` consumer inside
            // the tile (border, glow, hover) picks it up automatically.
            const accent = safeCssColor(genre.accentColor);
            const tileStyle = (accent ? { ["--color-accent" as string]: accent } : undefined) as
              | React.CSSProperties
              | undefined;

            return (
              <div key={genre.name} className="aspect-square flex" style={tileStyle}>
                <EmbossedButton
                  as="button"
                  type="button"
                  onClick={() => onSelect(genre.name)}
                  className="w-full h-full rounded-xl p-0 overflow-hidden"
                  aria-label={discoveryCopy.genreBrowse.search(genre.displayName)}
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
