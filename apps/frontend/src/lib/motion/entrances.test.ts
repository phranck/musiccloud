import gsap from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MotionDuration } from "./constants";
import { animateFadeIn, animateSlideOutDown, animateSlideUp, killEntranceTweens } from "./entrances";

/**
 * jsdom has no layout engine, so these tests assert the factories' behavioral
 * contracts on real GSAP tweens: the reduced-motion gate (the CSS rule in
 * `animations.css` only covers CSS animations — these factories are the only
 * guard for the JS tweens), keyframe-parity start/end values, the delay and
 * stagger knobs, the completion-callback contract of the exit, and the
 * cleanup conventions (entrances clear inline styles, the exit keeps its
 * hidden end state).
 */

/** Stagger step (s) used by the batch-stagger assertions. */
const STAGGER_EACH_SECONDS = 0.05;
/** Fixed per-element delay (s) for the single-element delay assertion. */
const DELAY_SECONDS = 0.3;

/**
 * Installs a `window.matchMedia` stub reporting the given reduced-motion
 * preference. jsdom does not implement `matchMedia`, so a plain stub (instead
 * of a spy on an existing method) is required.
 */
function stubPrefersReducedMotion(matches: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches } as MediaQueryList));
}

/** Creates `count` attached divs (GSAP needs in-document targets). */
function buildElements(count: number): HTMLDivElement[] {
  return Array.from({ length: count }, () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
  });
}

/** Reads a numeric tween-driven property from GSAP's cache. */
function readNumber(el: HTMLElement, property: string): number {
  return gsap.getProperty(el, property) as number;
}

afterEach(() => {
  gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.kill());
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("animateFadeIn", () => {
  it("returns null and writes no styles when the user prefers reduced motion", () => {
    stubPrefersReducedMotion(true);
    const [el] = buildElements(1);
    expect(animateFadeIn(el)).toBeNull();
    expect(el.style.opacity).toBe("");
  });

  it("returns null for an empty target collection (no GSAP warning tween)", () => {
    stubPrefersReducedMotion(false);
    expect(animateFadeIn([])).toBeNull();
  });

  it("starts hidden, runs for the fade duration, and clears inline styles on completion", () => {
    stubPrefersReducedMotion(false);
    const [el] = buildElements(1);
    const tween = animateFadeIn(el);
    expect(tween).not.toBeNull();
    expect(tween?.duration()).toBeCloseTo(MotionDuration.FadeIn);
    // fromTo renders the from-vars immediately (CSS `both` fill parity).
    expect(readNumber(el, "opacity")).toBe(0);
    tween?.progress(1, false);
    expect(el.style.opacity).toBe("");
  });
});

describe("animateSlideUp", () => {
  it("returns null and writes no styles when the user prefers reduced motion", () => {
    stubPrefersReducedMotion(true);
    const [el] = buildElements(1);
    expect(animateSlideUp(el)).toBeNull();
    expect(el.style.transform).toBe("");
  });

  it("starts at the slide-up keyframe's from values and settles clean", () => {
    stubPrefersReducedMotion(false);
    const [el] = buildElements(1);
    const tween = animateSlideUp(el);
    expect(tween?.duration()).toBeCloseTo(MotionDuration.SlideUp);
    expect(readNumber(el, "opacity")).toBe(0);
    expect(readNumber(el, "y")).toBeCloseTo(12);
    expect(readNumber(el, "scale")).toBeCloseTo(0.97);
    tween?.progress(1, false);
    expect(el.style.opacity).toBe("");
    expect(el.style.transform).toBe("");
  });

  it("applies a fixed start delay for single-row consumers", () => {
    stubPrefersReducedMotion(false);
    const [el] = buildElements(1);
    const tween = animateSlideUp(el, { delaySeconds: DELAY_SECONDS });
    expect(tween?.delay()).toBeCloseTo(DELAY_SECONDS);
  });

  it("staggers batch targets per index", () => {
    stubPrefersReducedMotion(false);
    const elements = buildElements(3);
    const tween = animateSlideUp(elements, { staggerEachSeconds: STAGGER_EACH_SECONDS });
    expect(tween).not.toBeNull();
    // Total runtime = last element's indexed delay + per-element duration.
    expect(tween?.totalDuration()).toBeCloseTo((elements.length - 1) * STAGGER_EACH_SECONDS + MotionDuration.SlideUp);
    // All targets snap to the hidden start state immediately — staggered
    // elements must not flash visible before their turn (CSS `both` parity).
    for (const el of elements) {
      expect(readNumber(el, "opacity")).toBe(0);
    }
  });
});

describe("animateSlideOutDown", () => {
  it("returns null without invoking the callback when the user prefers reduced motion", () => {
    stubPrefersReducedMotion(true);
    const [el] = buildElements(1);
    const onComplete = vi.fn();
    expect(animateSlideOutDown(el, { onComplete })).toBeNull();
    // The caller owns the synchronous fallback; the factory must not call it.
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("runs the keyframe-parity exit and fires the completion callback exactly once", () => {
    stubPrefersReducedMotion(false);
    const [el] = buildElements(1);
    const onComplete = vi.fn();
    const tween = animateSlideOutDown(el, { onComplete });
    expect(tween?.duration()).toBeCloseTo(MotionDuration.SlideOut);
    tween?.progress(1, false);
    expect(onComplete).toHaveBeenCalledTimes(1);
    // End state stays inline (the callback's state change unmounts the
    // element; clearing first would flash the old content for a frame).
    expect(readNumber(el, "opacity")).toBe(0);
    expect(readNumber(el, "y")).toBeCloseTo(40);
    expect(readNumber(el, "scale")).toBeCloseTo(0.95);
  });

  it("does not fire the completion callback when the tween is killed (interrupt)", () => {
    stubPrefersReducedMotion(false);
    const [el] = buildElements(1);
    const onComplete = vi.fn();
    const tween = animateSlideOutDown(el, { onComplete });
    tween?.progress(0.5, false);
    tween?.kill();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("killEntranceTweens", () => {
  it("stops in-flight tweens so manual choreographies can take over the element", () => {
    stubPrefersReducedMotion(false);
    const [el] = buildElements(1);
    animateSlideUp(el);
    expect(gsap.getTweensOf(el).length).toBeGreaterThan(0);
    killEntranceTweens(el);
    expect(gsap.getTweensOf(el)).toHaveLength(0);
  });
});
