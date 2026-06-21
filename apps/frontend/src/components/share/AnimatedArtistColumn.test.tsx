import type { ArtistInfoResponse } from "@musiccloud/shared";
import { render } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtistInfoStatus } from "@/components/artist/ArtistCardParts";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { AnimatedArtistColumn } from "@/components/share/AnimatedArtistColumn";
import { LocaleProvider } from "@/i18n/context";

/**
 * Flip-wiring contract of `AnimatedArtistColumn` on top of the
 * `lib/motion/flip.ts` helpers (whose tween mechanics are covered by
 * `lib/motion/flip.test.ts`). jsdom has no layout engine — every rect is zero
 * — so the size/position glide cannot be asserted here; its visual effect on
 * CLS was browser-measured against a prod build (plan MC-029 Task 2.6: the flip
 * is a motion polish that only marginally reduces the pre-existing shift). What
 * IS asserted here is the component's own flip-trigger logic, using only
 * rect-independent observables:
 *
 * - The column must NOT flip on its initial mount: the cards are SSR-rendered
 *   and hydrated in place, so a mount entrance would flicker (this is the
 *   deliberate deviation from `AnimatedPlatformGrid`, which DOES play a mount
 *   entrance).
 * - A reflow (the async artist-info load resolving) must run a flip. Asserted
 *   via the entering cards' `onEnter` tween, whose values are fixed
 *   (opacity/scale/y) and therefore observable even at zero rects.
 * - Reduced motion must skip the flip entirely.
 *
 * Tween presence is read via `gsap.getTweensOf` — never `isActive()`, which
 * keeps reporting `true` after `kill()` (GSAP quirk, established in
 * `swap.test.ts`).
 */

/** Settled-empty payload: every section empty, so three cards unmount (`return null`). */
const EMPTY_ARTIST_DATA: ArtistInfoResponse = {
  artistName: "Test Artist",
  topTracks: [],
  profile: null,
  events: [],
  similarArtistTracks: [],
};

const noop = () => {};
const noopResolve: ArtistPanelTrackResolveHandler = async () => {};

/** Builds the column element wrapped in the locale provider its cards require. */
function columnElement(artistData: ArtistInfoResponse | null, artistLoadStatus: ArtistInfoStatus, isLoading: boolean) {
  return (
    <LocaleProvider initialLocale="en">
      <AnimatedArtistColumn
        artistData={artistData}
        artistLoadStatus={artistLoadStatus}
        isLoading={isLoading}
        onArtistResolveStart={noop}
        onTrackResolve={noopResolve}
        userRegion=""
        widthPx={512}
      />
    </LocaleProvider>
  );
}

/** jsdom lacks `matchMedia`; a plain stub reporting the given reduced-motion preference is required. */
function stubMatchMedia(reducedMotion = false): void {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: reducedMotion } as MediaQueryList));
}

beforeEach(() => {
  stubMatchMedia();
});

afterEach(() => {
  gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.kill());
  vi.unstubAllGlobals();
});

describe("AnimatedArtistColumn flip wiring", () => {
  it("does not flip on initial mount so SSR-hydrated cards never flicker", () => {
    const { container } = render(columnElement(null, "loading", true));
    const column = container.firstElementChild as HTMLElement;

    expect(gsap.getTweensOf(column)).toHaveLength(0);
  });

  it("runs a flip on the column's cards when the artist-info load reflows", () => {
    // Settled-empty first (one card), then a fresh load: the three previously
    // unmounted cards re-enter, and the entrance flip animates them.
    const { container, rerender } = render(columnElement(EMPTY_ARTIST_DATA, "empty", false));
    const column = container.firstElementChild as HTMLElement;

    rerender(columnElement(null, "loading", true));

    expect(gsap.getTweensOf(Array.from(column.children)).length).toBeGreaterThan(0);
  });

  it("skips the reflow flip entirely when the user prefers reduced motion", () => {
    stubMatchMedia(true);
    const { container, rerender } = render(columnElement(EMPTY_ARTIST_DATA, "empty", false));
    const column = container.firstElementChild as HTMLElement;

    rerender(columnElement(null, "loading", true));

    expect(gsap.getTweensOf(Array.from(column.children))).toHaveLength(0);
  });
});
