import gsap from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildResizeTimeline, buildSwapTimeline, DEFAULT_SWAP_DURATION_MS } from "./swap";

/**
 * jsdom has no layout engine, so element heights are stubbed via
 * `getBoundingClientRect` and the tests assert the factories' behavioral
 * contracts on real GSAP timelines: the reduced-motion gate (the CSS rule in
 * `animations.css` only covers CSS animations — these factories are the only
 * guard for the JS tweens), the ms→s duration conversion at the GSAP
 * boundary, the keyframe-parity slide values, the counter-scale invariant
 * (wrapperScaleY * bufferScaleY == 1 on every frame), the cleanup/settle
 * contract on completion, and the interrupt contract (building on a wrapper
 * kills its in-flight predecessor — swap or resize — without firing the
 * superseded settle).
 */

/** Old wrapper height (px) used by the height-stubbed swap fixtures. */
const FROM_HEIGHT_PX = 100;
/** New wrapper height (px) — double the old one so scale ratios are easy to assert (0.5 / 2). */
const TO_HEIGHT_PX = 200;
/** Distinct duration override (ms) to prove the ms→s conversion is applied to the caller's value. */
const OVERRIDE_DURATION_MS = 310;
/** Slide start of the incoming buffer (yPercent), keyframe parity with `mc-group-slide-in`. */
const SLIDE_IN_FROM_Y_PERCENT = -112;
/** Slide end of the outgoing buffer (yPercent), keyframe parity with `mc-group-slide-out`. */
const SLIDE_OUT_TO_Y_PERCENT = 112;

/**
 * Installs a `window.matchMedia` stub reporting the given reduced-motion
 * preference. jsdom does not implement `matchMedia`, so a plain stub (instead
 * of a spy on an existing method) is required.
 */
function stubPrefersReducedMotion(matches: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches } as MediaQueryList));
}

/** Stubs the element's measured height (jsdom rects are otherwise all zero). */
function stubHeight(el: HTMLElement, height: number): void {
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 0, height, top: 0, right: 0, bottom: height, left: 0, toJSON: () => ({}) }) as DOMRect;
}

/** Creates a fresh height-stubbed buffer inside the wrapper — mirrors React's per-generation buffer remount (fresh, untransformed node). */
function appendBuffer(wrapper: HTMLElement, height: number): HTMLDivElement {
  const buffer = document.createElement("div");
  stubHeight(buffer, height);
  wrapper.appendChild(buffer);
  return buffer;
}

/** Builds the SmoothSwap DOM shape: wrapper with an absolute previous buffer and an in-flow current buffer. */
function buildSwapDom(
  fromHeight: number,
  toHeight: number,
): {
  wrapper: HTMLDivElement;
  previous: HTMLDivElement;
  current: HTMLDivElement;
} {
  const wrapper = document.createElement("div");
  document.body.appendChild(wrapper);
  const previous = appendBuffer(wrapper, fromHeight);
  const current = appendBuffer(wrapper, toHeight);
  return { wrapper, previous, current };
}

/** Reads a numeric transform component from GSAP's cache. */
function readNumber(el: HTMLElement, property: string): number {
  return gsap.getProperty(el, property) as number;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("buildSwapTimeline", () => {
  it("returns null and writes no styles when the user prefers reduced motion", () => {
    stubPrefersReducedMotion(true);
    const { wrapper, previous, current } = buildSwapDom(FROM_HEIGHT_PX, TO_HEIGHT_PX);
    const onSettle = vi.fn();
    expect(
      buildSwapTimeline({ wrapper, current, previous, durationMs: DEFAULT_SWAP_DURATION_MS, onSettle }),
    ).toBeNull();
    expect(onSettle).not.toHaveBeenCalled();
    expect(wrapper.style.transform).toBe("");
    expect(current.style.transform).toBe("");
  });

  it("converts the millisecond duration to GSAP seconds at the boundary", () => {
    stubPrefersReducedMotion(false);
    const { wrapper, previous, current } = buildSwapDom(FROM_HEIGHT_PX, TO_HEIGHT_PX);
    const timeline = buildSwapTimeline({
      wrapper,
      current,
      previous,
      durationMs: OVERRIDE_DURATION_MS,
      onSettle: vi.fn(),
    });
    expect(timeline?.duration()).toBeCloseTo(OVERRIDE_DURATION_MS / 1000);
    // Public-API default stays the old SmoothSwap 680 ms (MotionDuration.Swap in ms).
    expect(DEFAULT_SWAP_DURATION_MS).toBe(680);
    timeline?.kill();
  });

  it("starts with keyframe-parity slides and an exactly counter-scaled wrapper/buffer pair", () => {
    stubPrefersReducedMotion(false);
    const { wrapper, previous, current } = buildSwapDom(FROM_HEIGHT_PX, TO_HEIGHT_PX);
    const timeline = buildSwapTimeline({
      wrapper,
      current,
      previous,
      durationMs: DEFAULT_SWAP_DURATION_MS,
      onSettle: vi.fn(),
    });
    // Frame 0 (immediateRender + synchronous counter-scale): old visual height, undistorted buffers.
    expect(readNumber(current, "yPercent")).toBeCloseTo(SLIDE_IN_FROM_Y_PERCENT);
    expect(readNumber(previous, "yPercent")).toBeCloseTo(0);
    expect(readNumber(wrapper, "scaleY")).toBeCloseTo(FROM_HEIGHT_PX / TO_HEIGHT_PX);
    expect(readNumber(current, "scaleY")).toBeCloseTo(TO_HEIGHT_PX / FROM_HEIGHT_PX);
    expect(readNumber(previous, "scaleY")).toBeCloseTo(TO_HEIGHT_PX / FROM_HEIGHT_PX);
    timeline?.kill();
  });

  it("keeps the counter-scale product at exactly 1 mid-flight (no text distortion)", () => {
    stubPrefersReducedMotion(false);
    const { wrapper, previous, current } = buildSwapDom(FROM_HEIGHT_PX, TO_HEIGHT_PX);
    const timeline = buildSwapTimeline({
      wrapper,
      current,
      previous,
      durationMs: DEFAULT_SWAP_DURATION_MS,
      onSettle: vi.fn(),
    });
    for (const progress of [0.25, 0.5, 0.75]) {
      timeline?.progress(progress, false);
      expect(readNumber(wrapper, "scaleY") * readNumber(current, "scaleY")).toBeCloseTo(1, 6);
      expect(readNumber(wrapper, "scaleY") * readNumber(previous, "scaleY")).toBeCloseTo(1, 6);
    }
    timeline?.kill();
  });

  it("settles on completion: clears wrapper/current inline styles, keeps the outgoing buffer hidden below the clip", () => {
    stubPrefersReducedMotion(false);
    const { wrapper, previous, current } = buildSwapDom(FROM_HEIGHT_PX, TO_HEIGHT_PX);
    const onSettle = vi.fn();
    const timeline = buildSwapTimeline({ wrapper, current, previous, durationMs: DEFAULT_SWAP_DURATION_MS, onSettle });
    timeline?.progress(1, false);
    expect(onSettle).toHaveBeenCalledTimes(1);
    // Persistent elements end without stale inline styles (natural auto height restored)...
    expect(wrapper.style.transform).toBe("");
    expect(current.style.transform).toBe("");
    // ...while the previous buffer keeps its end transform until React unmounts it.
    expect(readNumber(previous, "yPercent")).toBeCloseTo(SLIDE_OUT_TO_Y_PERCENT);
  });

  it("skips the scale tween (slides only) when both contents have the same height", () => {
    stubPrefersReducedMotion(false);
    const { wrapper, previous, current } = buildSwapDom(FROM_HEIGHT_PX, FROM_HEIGHT_PX);
    const timeline = buildSwapTimeline({
      wrapper,
      current,
      previous,
      durationMs: DEFAULT_SWAP_DURATION_MS,
      onSettle: vi.fn(),
    });
    expect(readNumber(wrapper, "scaleY")).toBe(1);
    expect(readNumber(current, "yPercent")).toBeCloseTo(SLIDE_IN_FROM_Y_PERCENT);
    expect(timeline?.duration()).toBeCloseTo(DEFAULT_SWAP_DURATION_MS / 1000);
    timeline?.kill();
  });

  it("kills the in-flight predecessor swap on the same wrapper without firing its settle (interrupt)", () => {
    stubPrefersReducedMotion(false);
    const { wrapper, previous, current } = buildSwapDom(FROM_HEIGHT_PX, TO_HEIGHT_PX);
    const supersededSettle = vi.fn();
    const first = buildSwapTimeline({
      wrapper,
      current,
      previous,
      durationMs: DEFAULT_SWAP_DURATION_MS,
      onSettle: supersededSettle,
    });
    first?.progress(0.5, false);

    // React remounts both buffers per generation; only the wrapper persists.
    previous.remove();
    current.remove();
    const nextPrevious = appendBuffer(wrapper, TO_HEIGHT_PX);
    const nextCurrent = appendBuffer(wrapper, FROM_HEIGHT_PX);
    const second = buildSwapTimeline({
      wrapper,
      current: nextCurrent,
      previous: nextPrevious,
      durationMs: DEFAULT_SWAP_DURATION_MS,
      onSettle: vi.fn(),
    });

    // Exactly one live tween drives the wrapper — the predecessor is dead,
    // not fighting the successor for scaleY (gsap defaults to overwrite:false;
    // killed timelines still report isActive()=true, so count tweens instead).
    expect(first).not.toBeNull();
    expect(gsap.getTweensOf(wrapper)).toHaveLength(1);
    // The successor's counter-scale invariant holds right away.
    second?.progress(0.5, false);
    expect(readNumber(wrapper, "scaleY") * readNumber(nextCurrent, "scaleY")).toBeCloseTo(1, 6);
    // Kill suppresses the superseded onComplete: its settle must never fire.
    second?.progress(1, false);
    expect(supersededSettle).not.toHaveBeenCalled();
  });

  it("kills an in-flight resize timeline when a swap starts on the same wrapper", () => {
    stubPrefersReducedMotion(false);
    const { wrapper, previous, current } = buildSwapDom(FROM_HEIGHT_PX, TO_HEIGHT_PX);
    const resize = buildResizeTimeline({
      wrapper,
      current,
      fromHeight: FROM_HEIGHT_PX,
      toHeight: TO_HEIGHT_PX,
      durationMs: DEFAULT_SWAP_DURATION_MS,
    });
    resize?.progress(0.5, false);

    const swap = buildSwapTimeline({
      wrapper,
      current,
      previous,
      durationMs: DEFAULT_SWAP_DURATION_MS,
      onSettle: vi.fn(),
    });

    // Only the swap's tween remains on the wrapper; the resize predecessor
    // is killed by the factory (its useEffect-owned kill in SmoothSwap only
    // runs after paint — too late for the pre-paint swap build).
    expect(resize).not.toBeNull();
    expect(gsap.getTweensOf(wrapper)).toHaveLength(1);
    swap?.kill();
  });
});

describe("buildResizeTimeline", () => {
  it("returns null and writes no styles when the user prefers reduced motion", () => {
    stubPrefersReducedMotion(true);
    const { wrapper, current } = buildSwapDom(FROM_HEIGHT_PX, TO_HEIGHT_PX);
    const timeline = buildResizeTimeline({
      wrapper,
      current,
      fromHeight: FROM_HEIGHT_PX,
      toHeight: TO_HEIGHT_PX,
      durationMs: DEFAULT_SWAP_DURATION_MS,
    });
    expect(timeline).toBeNull();
    expect(wrapper.style.transform).toBe("");
  });

  it("scale-animates the wrapper with a counter-scaled buffer and clears all inline styles on completion", () => {
    stubPrefersReducedMotion(false);
    const { wrapper, current } = buildSwapDom(FROM_HEIGHT_PX, TO_HEIGHT_PX);
    const timeline = buildResizeTimeline({
      wrapper,
      current,
      fromHeight: FROM_HEIGHT_PX,
      toHeight: TO_HEIGHT_PX,
      durationMs: OVERRIDE_DURATION_MS,
    });
    expect(timeline?.duration()).toBeCloseTo(OVERRIDE_DURATION_MS / 1000);
    expect(readNumber(wrapper, "scaleY")).toBeCloseTo(FROM_HEIGHT_PX / TO_HEIGHT_PX);
    expect(readNumber(current, "scaleY")).toBeCloseTo(TO_HEIGHT_PX / FROM_HEIGHT_PX);
    timeline?.progress(1, false);
    expect(wrapper.style.transform).toBe("");
    expect(current.style.transform).toBe("");
  });
});
