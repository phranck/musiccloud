import gsap from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MotionDuration } from "./constants";
import { buildCoverSwapTimeline } from "./coverSwap";

/**
 * jsdom has no layout engine, so the tests assert the factory's behavioral
 * contracts on real GSAP timelines: the reduced-motion gate (the only guard
 * for JS tweens), keyframe-parity slide values (`mc-cover-slide-in/out`
 * ports), the settle contract on natural completion (incoming cleaned,
 * outgoing kept hidden below the clip), and settle suppression on kill
 * (interrupting swaps own the cleanup).
 */

/**
 * Installs a `window.matchMedia` stub reporting the given reduced-motion
 * preference. jsdom does not implement `matchMedia`, so a plain stub (instead
 * of a spy on an existing method) is required.
 */
function stubPrefersReducedMotion(matches: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches } as MediaQueryList));
}

/** Builds the SongInfo cover-buffer shape: a clipping screen with two absolutely stacked covers. */
function buildCoverDom(): { incoming: HTMLDivElement; outgoing: HTMLDivElement } {
  const screen = document.createElement("div");
  document.body.appendChild(screen);
  const outgoing = document.createElement("div");
  const incoming = document.createElement("div");
  screen.append(outgoing, incoming);
  return { incoming, outgoing };
}

/** Reads a numeric transform component from GSAP's cache. */
function readNumber(el: HTMLElement, property: string): number {
  return gsap.getProperty(el, property) as number;
}

afterEach(() => {
  gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.kill());
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("buildCoverSwapTimeline", () => {
  it("returns null without styles or settle when the user prefers reduced motion", () => {
    stubPrefersReducedMotion(true);
    const { incoming, outgoing } = buildCoverDom();
    const onSettle = vi.fn();
    expect(buildCoverSwapTimeline({ incoming, outgoing, onSettle })).toBeNull();
    expect(onSettle).not.toHaveBeenCalled();
    expect(incoming.style.transform).toBe("");
    expect(outgoing.style.transform).toBe("");
  });

  it("starts with keyframe-parity slide positions and the cover-swap duration", () => {
    stubPrefersReducedMotion(false);
    const { incoming, outgoing } = buildCoverDom();
    const timeline = buildCoverSwapTimeline({ incoming, outgoing, onSettle: vi.fn() });
    expect(timeline?.duration()).toBeCloseTo(MotionDuration.CoverSwap);
    // Frame 0 (immediateRender): incoming above the clip, outgoing in place.
    expect(readNumber(incoming, "yPercent")).toBeCloseTo(-100);
    expect(readNumber(outgoing, "yPercent")).toBeCloseTo(0);
  });

  it("settles on completion: clears the incoming cover, keeps the outgoing one below the clip", () => {
    stubPrefersReducedMotion(false);
    const { incoming, outgoing } = buildCoverDom();
    const onSettle = vi.fn();
    const timeline = buildCoverSwapTimeline({ incoming, outgoing, onSettle });
    timeline?.progress(1, false);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(incoming.style.transform).toBe("");
    expect(readNumber(outgoing, "yPercent")).toBeCloseTo(100);
  });

  it("suppresses the settle when killed (an interrupting swap supersedes it)", () => {
    stubPrefersReducedMotion(false);
    const { incoming, outgoing } = buildCoverDom();
    const onSettle = vi.fn();
    const timeline = buildCoverSwapTimeline({ incoming, outgoing, onSettle });
    timeline?.progress(0.5, false);
    timeline?.kill();
    expect(onSettle).not.toHaveBeenCalled();
  });
});
