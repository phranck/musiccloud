import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "@/components/landing/LandingPage";

/**
 * Wiring contract of the hero search-field return flip (`useFlipAnimation`).
 *
 * jsdom has no layout engine (all rects are zero), so the glide itself cannot
 * be asserted visually — `useFlipAnimation.test.ts` and `lib/motion/flip.test.ts`
 * cover the animation mechanics. What CAN be asserted here is the page-level
 * wiring: every clear path that re-centers the field must arm the return flip,
 * which the page projects as a GSAP fade tween on the large logo block while
 * `isReturning` is `true` (the logo fades back in while the field travels).
 * An active tween on that block (`gsap.getTweensOf`) is therefore the
 * observable proxy for "the flip runs" — it replaced the former
 * `animate-fade-in` class assert when the entrance moved from CSS to GSAP.
 *
 * The clearing slide-out is GSAP-driven too: tests complete its tween on the
 * results panel via `totalProgress(1)` (deterministic, no ticker time) where
 * they previously dispatched a synthetic `animationend`.
 */

// The lazy result-time panels pull heavy share/audio UI into jsdom; the page
// wiring under test only needs mountable placeholders (plus a clickable
// cancel for the disambiguation flow).
vi.mock("@/lib/preload/resultRuntime", () => ({
  loadDisambiguationPanel: () =>
    Promise.resolve({
      default: ({ onCancel }: { onCancel: () => void }) => (
        <button type="button" onClick={onCancel}>
          cancel-disambiguation
        </button>
      ),
    }),
  loadGenreBrowseGrid: () => Promise.resolve({ default: () => <div data-testid="genre-browse-stub" /> }),
  loadGenreSearchResults: () => Promise.resolve({ default: () => <div data-testid="genre-search-stub" /> }),
  loadShareLayout: () => Promise.resolve({ default: () => <div data-testid="share-layout-stub" /> }),
  loadToast: () => Promise.resolve({ default: () => null }),
  preloadResolveResultRuntime: vi.fn(),
}));

const TRACK_RESOLVE_RESPONSE = {
  type: "track",
  track: {
    title: "Test Song",
    artists: ["Test Artist"],
    albumName: "Test Album",
    durationMs: 200_000,
    artworkUrl: "",
  },
  links: [],
  shortUrl: "https://musiccloud.io/abc12",
};

const HERO_INPUT_LABEL = "Search for music by link or name";
/** Compound selector for the large (non-compact) logo block of `LandingLogoBlock`. */
const BIG_LOGO_SELECTOR = ".flex.justify-center.mb-10";

const originalMatchMedia = window.matchMedia;

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => store.delete(key)),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  };
}

/**
 * `matches: false` everywhere is load-bearing twice: `(prefers-reduced-motion)`
 * must be false so `animateFlipFrom` creates a real timeline (otherwise
 * `isReturning` releases synchronously and the wiring is unobservable), and
 * `(hover: hover)` must be false so `HeroInput` skips its autofocus timer.
 */
function mockMatchMedia(): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function mockResolveFetch(payload: unknown): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
}

async function submitQuery(query: string): Promise<void> {
  const input = screen.getByLabelText(HERO_INPUT_LABEL);
  fireEvent.change(input, { target: { value: query } });
  fireEvent.keyDown(input, { key: "Enter" });
}

/** The armed flip projects as an in-flight GSAP fade tween on the large logo block. */
function expectReturnFlipArmed(): void {
  const logoBlock = document.querySelector(BIG_LOGO_SELECTOR);
  expect(logoBlock).not.toBeNull();
  expect(gsap.getTweensOf(logoBlock as Element).length).toBeGreaterThan(0);
}

/**
 * Drives every in-flight GSAP animation (logo fade, return flip, entrance
 * fades) to completion, firing their onComplete handlers inside `act` so the
 * flip releases `isReturning` and no tween leaks into the next test.
 * Deterministic: jumps to the end state instead of ticking real time.
 */
function settleAllAnimations(): void {
  act(() => {
    gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.totalProgress(1));
  });
  const logoBlock = document.querySelector(BIG_LOGO_SELECTOR);
  if (logoBlock) expect(gsap.getTweensOf(logoBlock).length).toBe(0);
}

beforeEach(() => {
  mockMatchMedia();
  vi.stubGlobal("localStorage", createLocalStorageMock());
});

afterEach(() => {
  // Kill any animation a failing assertion may have left behind before RTL
  // unmounts the tree (idempotent next to the useGSAP unmount reverts).
  gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.kill());
  window.matchMedia = originalMatchMedia;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LandingPage search-field return flip wiring", () => {
  it("arms the return flip when a resolved result is cleared via the share logo", async () => {
    mockResolveFetch(TRACK_RESOLVE_RESPONSE);
    render(<LandingPage />);

    await submitQuery("https://open.spotify.com/track/x");

    // Result view: the share-style layout replaces the hero field entirely.
    const homeLink = await screen.findByLabelText("Go to musiccloud home");
    expect(screen.queryByLabelText(HERO_INPUT_LABEL)).toBeNull();

    // Logo click starts the clearing slide-out tween on the results panel;
    // completing it fires the timeline's onComplete, which hands over to the
    // field-return choreography (the GSAP replacement of `animationend`).
    fireEvent.click(homeLink);
    const resultsPanel = homeLink.closest('div[tabindex="-1"]');
    expect(resultsPanel).not.toBeNull();
    const slideOutTweens = gsap.getTweensOf(resultsPanel as Element);
    expect(slideOutTweens.length).toBeGreaterThan(0);
    act(() => {
      slideOutTweens.forEach((tween) => tween.totalProgress(1));
    });

    expect(screen.getByLabelText(HERO_INPUT_LABEL)).toBeInTheDocument();
    expectReturnFlipArmed();
    settleAllAnimations();
  });

  it("arms the return flip when disambiguation is cancelled", async () => {
    mockResolveFetch({ status: "disambiguation", candidates: [{ id: "c1" }] });
    render(<LandingPage />);

    await submitQuery("ambiguous query");
    fireEvent.click(await screen.findByText("cancel-disambiguation"));

    expect(screen.getByLabelText(HERO_INPUT_LABEL)).toBeInTheDocument();
    expectReturnFlipArmed();
    settleAllAnimations();
  });

  it("arms the return flip when the compact field is cleared via its clear button", async () => {
    mockResolveFetch({ status: "genre-browse", genres: [] });
    render(<LandingPage />);

    await submitQuery("genre:?");
    await waitFor(() => expect(screen.getByLabelText("Clear search")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Clear search"));

    expectReturnFlipArmed();
    settleAllAnimations();
  });

  it("does not arm the return flip when clearing from the centered idle layout", () => {
    mockResolveFetch({});
    render(<LandingPage />);

    fireEvent.change(screen.getByLabelText(HERO_INPUT_LABEL), { target: { value: "some text" } });
    fireEvent.click(screen.getByLabelText("Clear search"));

    const logoBlock = document.querySelector(BIG_LOGO_SELECTOR);
    expect(logoBlock).not.toBeNull();
    expect(gsap.getTweensOf(logoBlock as Element)).toHaveLength(0);
  });
});
