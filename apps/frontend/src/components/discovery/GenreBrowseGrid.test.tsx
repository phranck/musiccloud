import type { ApiGenreTile } from "@musiccloud/shared";
import { render } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenreBrowseGrid } from "@/components/discovery/GenreBrowseGrid";

/**
 * Entrance-wiring contract of `GenreBrowseGrid`. The grid rises in as one
 * element with the CSS `animate-slide-up`, which the browser runs off the main
 * thread. Tiles rising one by one keep Safari repainting the whole scrolling
 * grid for as long as any tile still moves, so no tile carries an entrance of
 * its own, CSS or GSAP.
 */

/** Enough tiles to fill several rows of the grid. */
const TILE_COUNT = 26;

function buildGenres(count: number): ApiGenreTile[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `genre-${i}`,
    displayName: `Genre ${i}`,
    artworkUrl: `/api/v1/genre-artwork/genre-${i}`,
  }));
}

/** Inert IntersectionObserver stand-in — jsdom does not implement it, and the tiles' LazyGenreArtwork observes itself on mount. */
class IntersectionObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  // jsdom lacks matchMedia (read by the panel's FadeInOnMount reduced-motion gate).
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
  vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
});

afterEach(() => {
  gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.kill());
  vi.unstubAllGlobals();
});

describe("GenreBrowseGrid entrance", () => {
  it("rises in as one element while the tiles carry no entrance of their own", () => {
    const { container } = render(<GenreBrowseGrid genres={buildGenres(TILE_COUNT)} onSelect={() => {}} />);

    const rising = Array.from(container.querySelectorAll(".animate-slide-up")) as HTMLElement[];
    expect(rising).toHaveLength(1);

    const tiles = Array.from(container.querySelectorAll('button[aria-label^="Search "]')).map(
      (button) => button.parentElement as HTMLElement,
    );
    expect(tiles).toHaveLength(TILE_COUNT);
    expect(rising[0].children).toHaveLength(TILE_COUNT);
    for (const tile of tiles) expect(tile.style.animationDelay).toBe("");
    expect(gsap.getTweensOf(tiles)).toHaveLength(0);
  });
});
