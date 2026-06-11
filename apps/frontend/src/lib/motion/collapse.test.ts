import gsap from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCollapseTimeline, buildExpandTimeline } from "./collapse";
import { MotionDuration } from "./constants";

/**
 * jsdom has no layout engine, but the curtain mechanism is measurement-free
 * (percent translations), so the tests can assert the full behavioral
 * contracts on real GSAP timelines: the instant/reduced-motion gates (with
 * residue stripping), the seeded closed start values of a fresh expand vs.
 * the resume semantics of an interrupted direction change, the clean settled
 * end states, the interrupt contract (a new build kills the shell's
 * in-flight predecessor without firing its settle), and the collapse
 * unmount callback firing only on natural completion.
 */

/** Mid-flight progress used by the interrupt/resume fixtures. */
const MID_FLIGHT_PROGRESS = 0.5;

/**
 * Installs a `window.matchMedia` stub reporting the given reduced-motion
 * preference. jsdom does not implement `matchMedia`, so a plain stub (instead
 * of a spy on an existing method) is required.
 */
function stubPrefersReducedMotion(matches: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches } as MediaQueryList));
}

/** Builds the CollapsibleSection element triple: shell > curtain > content. */
function buildSectionDom(): { shell: HTMLDivElement; curtain: HTMLDivElement; content: HTMLDivElement } {
  const shell = document.createElement("div");
  document.body.appendChild(shell);
  const curtain = document.createElement("div");
  shell.appendChild(curtain);
  const content = document.createElement("div");
  curtain.appendChild(content);
  return { shell, curtain, content };
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

describe("buildExpandTimeline", () => {
  it("returns null and strips residue when the user prefers reduced motion", () => {
    stubPrefersReducedMotion(true);
    const { shell, curtain, content } = buildSectionDom();
    // Simulate the settled-collapse residue the shell intentionally keeps.
    gsap.set(shell, { opacity: 0 });
    expect(buildExpandTimeline({ shell, curtain, content, fromCollapsed: true })).toBeNull();
    expect(shell.style.opacity).toBe("");
  });

  it("returns null and strips residue on the caller-side instant gate", () => {
    stubPrefersReducedMotion(false);
    const { shell, curtain, content } = buildSectionDom();
    gsap.set(shell, { opacity: 0 });
    expect(buildExpandTimeline({ shell, curtain, content, fromCollapsed: true, instant: true })).toBeNull();
    expect(shell.style.opacity).toBe("");
  });

  it("seeds the closed start values on a fresh expand and settles with clean inline styles", () => {
    stubPrefersReducedMotion(false);
    const { shell, curtain, content } = buildSectionDom();
    const timeline = buildExpandTimeline({ shell, curtain, content, fromCollapsed: true });
    expect(timeline?.duration()).toBeCloseTo(MotionDuration.Collapse);
    // Pre-paint closed state: curtain raised, content counter-lowered, hidden.
    expect(readNumber(curtain, "yPercent")).toBeCloseTo(-100);
    expect(readNumber(content, "yPercent")).toBeCloseTo(100);
    expect(readNumber(shell, "opacity")).toBe(0);
    timeline?.progress(1, false);
    // A settled-open section is indistinguishable from one that never animated.
    expect(shell.style.opacity).toBe("");
    expect(curtain.style.transform).toBe("");
    expect(content.style.transform).toBe("");
  });

  it("keeps the curtain/content translations exact opposites mid-flight (content stands still)", () => {
    stubPrefersReducedMotion(false);
    const { shell, curtain, content } = buildSectionDom();
    const timeline = buildExpandTimeline({ shell, curtain, content, fromCollapsed: true });
    for (const progress of [0.25, 0.5, 0.75]) {
      timeline?.progress(progress, false);
      expect(readNumber(curtain, "yPercent") + readNumber(content, "yPercent")).toBeCloseTo(0, 6);
    }
  });

  it("resumes from the killed collapse's mid-flight values instead of snapping closed", () => {
    stubPrefersReducedMotion(false);
    const { shell, curtain, content } = buildSectionDom();
    const collapse = buildCollapseTimeline({ shell, curtain, content, onCollapsed: vi.fn() });
    collapse?.progress(MID_FLIGHT_PROGRESS, false);
    const midCurtain = readNumber(curtain, "yPercent");
    expect(midCurtain).toBeLessThan(0);
    expect(midCurtain).toBeGreaterThan(-100);

    const expand = buildExpandTimeline({ shell, curtain, content, fromCollapsed: false });
    // The interrupting build must not seed the fully-closed start values.
    expect(readNumber(curtain, "yPercent")).toBeCloseTo(midCurtain);
    // Exactly one driver per element: the collapse predecessor is dead.
    expect(gsap.getTweensOf(curtain)).toHaveLength(1);
    expand?.progress(1, false);
    expect(curtain.style.transform).toBe("");
  });
});

describe("buildCollapseTimeline", () => {
  it("returns null without the callback when the user prefers reduced motion (caller unmounts)", () => {
    stubPrefersReducedMotion(true);
    const { shell, curtain, content } = buildSectionDom();
    const onCollapsed = vi.fn();
    expect(buildCollapseTimeline({ shell, curtain, content, onCollapsed })).toBeNull();
    expect(onCollapsed).not.toHaveBeenCalled();
  });

  it("runs to the collapsed end state and fires the unmount callback exactly once", () => {
    stubPrefersReducedMotion(false);
    const { shell, curtain, content } = buildSectionDom();
    const onCollapsed = vi.fn();
    const timeline = buildCollapseTimeline({ shell, curtain, content, onCollapsed });
    expect(timeline?.duration()).toBeCloseTo(MotionDuration.Collapse);
    timeline?.progress(1, false);
    expect(onCollapsed).toHaveBeenCalledTimes(1);
    expect(readNumber(curtain, "yPercent")).toBeCloseTo(-100);
    expect(readNumber(content, "yPercent")).toBeCloseTo(100);
    // The shell keeps opacity 0 inline until the next expand strips it —
    // clearing here would flash the children before their unmount commit.
    expect(readNumber(shell, "opacity")).toBe(0);
  });

  it("does not fire the unmount callback when an interrupting expand kills it", () => {
    stubPrefersReducedMotion(false);
    const { shell, curtain, content } = buildSectionDom();
    const onCollapsed = vi.fn();
    const collapse = buildCollapseTimeline({ shell, curtain, content, onCollapsed });
    collapse?.progress(MID_FLIGHT_PROGRESS, false);

    const expand = buildExpandTimeline({ shell, curtain, content, fromCollapsed: false });
    expand?.progress(1, false);
    expect(onCollapsed).not.toHaveBeenCalled();
  });
});
