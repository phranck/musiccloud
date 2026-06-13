import { afterEach, describe, expect, it, vi } from "vitest";
import { MotionDuration } from "./constants";
import { animateFlipEnter, animateFlipFrom, captureFlipState } from "./flip";

/**
 * jsdom has no layout engine (all rects are zero), so these tests cannot
 * assert visual flip output. They cover the wrapper's behavioral contracts
 * instead: the reduced-motion gate (the CSS rule in `animations.css` only
 * covers CSS animations/transitions — GSAP tweens are JS-driven, making this
 * gate the ONLY reduced-motion guard) and the project default / override
 * duration on the returned animations.
 */

/** Distinct override value to prove the duration knob is honored (MotionDuration.Grid is 0.62). */
const OVERRIDE_DURATION_S = 0.31;

/**
 * Installs a `window.matchMedia` stub reporting the given reduced-motion
 * preference. jsdom does not implement `matchMedia`, so a plain stub (instead
 * of a spy on an existing method) is required.
 */
function stubPrefersReducedMotion(matches: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches } as MediaQueryList));
}

function buildGrid(): { grid: HTMLDivElement; items: HTMLDivElement[] } {
  const grid = document.createElement("div");
  const items = [document.createElement("div"), document.createElement("div")];
  for (const item of items) grid.appendChild(item);
  document.body.appendChild(grid);
  return { grid, items };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("animateFlipFrom", () => {
  it("returns null and creates no animation when the user prefers reduced motion", () => {
    stubPrefersReducedMotion(true);
    const { grid, items } = buildGrid();
    const state = captureFlipState([grid, ...items]);
    expect(animateFlipFrom(state, { targets: [grid, ...items], absolute: items })).toBeNull();
  });

  it("returns a Flip timeline with the project grid duration by default", () => {
    stubPrefersReducedMotion(false);
    const { grid, items } = buildGrid();
    const state = captureFlipState([grid, ...items]);
    const timeline = animateFlipFrom(state, { targets: [grid, ...items], absolute: items });
    expect(timeline).not.toBeNull();
    expect(timeline?.duration()).toBeCloseTo(MotionDuration.Grid);
    timeline?.kill();
  });

  it("honors a per-call duration override (consumers with non-grid timings)", () => {
    stubPrefersReducedMotion(false);
    const { grid, items } = buildGrid();
    const state = captureFlipState([grid, ...items]);
    const timeline = animateFlipFrom(state, {
      targets: [grid, ...items],
      absolute: items,
      duration: OVERRIDE_DURATION_S,
    });
    expect(timeline?.duration()).toBeCloseTo(OVERRIDE_DURATION_S);
    timeline?.kill();
  });
});

describe("animateFlipEnter", () => {
  it("returns null and creates no tween when the user prefers reduced motion", () => {
    stubPrefersReducedMotion(true);
    const { items } = buildGrid();
    expect(animateFlipEnter(items)).toBeNull();
  });

  it("plays the entrance tween with the project grid duration otherwise", () => {
    stubPrefersReducedMotion(false);
    const { items } = buildGrid();
    const tween = animateFlipEnter(items);
    expect(tween).not.toBeNull();
    expect(tween?.duration()).toBeCloseTo(MotionDuration.Grid);
    tween?.kill();
  });
});
