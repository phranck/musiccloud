import type { ArtistInfoResponse } from "@musiccloud/shared";
import { render } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ArtistCardLabels,
  ArtistInfoStatus,
  ArtistPanelTrackResolveHandler,
} from "@/components/artist/artistPanelTypes";
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

/**
 * Settled payload with exactly one visible card: a profile is present (so the
 * profile card renders) while every list section is empty (so the other three
 * cards self-hide). The reflow tests need a persistent card as the flip's
 * "before" anchor — with zero cards there is nothing to flip from.
 */
const SETTLED_PROFILE_ONLY_DATA: ArtistInfoResponse = {
  artistName: "Test Artist",
  topTracks: [],
  profile: {
    imageUrl: null,
    genres: [],
    popularity: null,
    followers: null,
    bioSummary: "Test bio.",
    scrobbles: null,
    similarArtists: [],
  },
  events: [],
  similarArtistTracks: [],
};

const noop = () => {};
const noopResolve: ArtistPanelTrackResolveHandler = async () => {};
const TEST_LABELS: ArtistCardLabels = {
  profile: "Artist Info",
  popularTracks: "Popular Tracks",
  events: "Upcoming Events",
  similar: "Similar Artists",
  profileProvidedBy: "Artist data provided by Spotify, Deezer & Last.fm",
};

/** Builds the column element wrapped in the locale provider its cards require. */
function columnElement(artistData: ArtistInfoResponse | null, artistLoadStatus: ArtistInfoStatus, isLoading: boolean) {
  return (
    <LocaleProvider initialLocale="en">
      <AnimatedArtistColumn
        artistData={artistData}
        artistLoadStatus={artistLoadStatus}
        isLoading={isLoading}
        onArtistResolveStart={noop}
        labels={TEST_LABELS}
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
    // Settled with one visible card (profile), then a fresh load: the three
    // previously hidden cards re-enter, and the entrance flip animates them.
    const { container, rerender } = render(columnElement(SETTLED_PROFILE_ONLY_DATA, "ready", false));
    const column = container.firstElementChild as HTMLElement;

    rerender(columnElement(null, "loading", true));

    expect(gsap.getTweensOf(Array.from(column.children)).length).toBeGreaterThan(0);
  });

  it("skips the reflow flip entirely when the user prefers reduced motion", () => {
    stubMatchMedia(true);
    const { container, rerender } = render(columnElement(SETTLED_PROFILE_ONLY_DATA, "ready", false));
    const column = container.firstElementChild as HTMLElement;

    rerender(columnElement(null, "loading", true));

    expect(gsap.getTweensOf(Array.from(column.children))).toHaveLength(0);
  });
});

describe("AnimatedArtistColumn error state", () => {
  // The flat `artist.error` value from the en translations the LocaleProvider loads.
  const ARTIST_ERROR_MESSAGE = "Artist data could not be loaded.";

  it("renders a single notice instead of four blank cards on a failed first load", () => {
    const { getByText } = render(columnElement(null, "error", false));

    expect(getByText(ARTIST_ERROR_MESSAGE)).toBeTruthy();
  });

  it("stays on the cards path (last-known data) when an error carries prior data", () => {
    const { queryByText } = render(columnElement(SETTLED_PROFILE_ONLY_DATA, "error", false));

    expect(queryByText(ARTIST_ERROR_MESSAGE)).toBeNull();
  });
});
