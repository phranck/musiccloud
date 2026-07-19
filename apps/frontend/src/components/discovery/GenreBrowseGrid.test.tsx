import type { ApiGenreTile } from "@musiccloud/shared";
import { render } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenreBrowseGrid } from "@/components/discovery/GenreBrowseGrid";

/**
 * Entrance-wiring contract of `GenreBrowseGrid`. The tile entrance is
 * deliberately CSS (`animate-slide-up` + per-tile `animation-delay`), NOT a
 * GSAP tween: the grid mounts ~250 tiles at once, and a JS tween init reads
 * computed styles per target inside the React commit — measured as 200+ ms of
 * forced-reflow time and two >50 ms long tasks in the MC-029 Phase-2 gate.
 * CSS animations scale without main-thread work. These tests pin that
 * decision: a future "unify on GSAP" sweep that re-migrates the tiles flips
 * them red.
 */

/** Mirror of the component's per-tile stagger step (ms per index). */
const EXPECTED_STAGGER_MS = 30;

/** Mirror of the component's stagger cap in ms. */
const EXPECTED_CAP_MS = 600;

/** Index of a tile whose uncapped delay would exceed the cap (25 * 30 = 750). */
const PAST_CAP_INDEX = 25;

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

describe("GenreBrowseGrid tile entrance", () => {
  it("renders tiles with the CSS slide-up entrance and capped per-index delays, without GSAP tweens", () => {
    const { container } = render(<GenreBrowseGrid genres={buildGenres(PAST_CAP_INDEX + 1)} onSelect={() => {}} />);

    const tiles = Array.from(container.querySelectorAll(".animate-slide-up")) as HTMLElement[];
    expect(tiles).toHaveLength(PAST_CAP_INDEX + 1);

    expect(tiles[0].style.animationDelay).toBe("0ms");
    expect(tiles[1].style.animationDelay).toBe(`${EXPECTED_STAGGER_MS}ms`);
    expect(tiles[PAST_CAP_INDEX].style.animationDelay).toBe(`${EXPECTED_CAP_MS}ms`);

    // The CSS entrance must not be doubled by a JS tween per tile.
    expect(gsap.getTweensOf(tiles)).toHaveLength(0);
  });
});
