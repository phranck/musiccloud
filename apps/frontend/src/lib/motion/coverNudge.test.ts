import gsap from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCoverNudgeTimeline,
  COVER_NUDGE_DISTANCE_PX,
  COVER_NUDGE_REPEAT_DISTANCE_PX,
  stopCoverNudge,
} from "./coverNudge";

function stubPrefersReducedMotion(matches: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches } as MediaQueryList));
}

function buildStage(): HTMLDivElement {
  const stage = document.createElement("div");
  document.body.appendChild(stage);
  return stage;
}

function readX(stage: HTMLElement): number {
  return gsap.getProperty(stage, "x") as number;
}

afterEach(() => {
  gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.kill());
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("cover nudge timeline", () => {
  it("does not write styles when reduced motion is requested", () => {
    stubPrefersReducedMotion(true);
    const stage = buildStage();

    expect(buildCoverNudgeTimeline(stage)).toBeNull();
    expect(stage.style.transform).toBe("");
    expect(stage.style.transition).toBe("");
  });

  it("overshoots dynamically, weakens the second excursion, and settles without inline styles", () => {
    stubPrefersReducedMotion(false);
    const stage = buildStage();
    const timeline = buildCoverNudgeTimeline(stage);
    expect(timeline).not.toBeNull();

    const first: number[] = [];
    const second: number[] = [];
    const samples = 400;
    for (let step = 0; step <= samples; step += 1) {
      timeline?.progress(step / samples, false);
      const x = readX(stage);
      if (step <= samples / 2) first.push(x);
      else second.push(x);
    }

    expect(Math.min(...first)).toBeLessThan(-COVER_NUDGE_DISTANCE_PX);
    expect(Math.min(...second)).toBeLessThan(0);
    expect(Math.min(...first)).toBeLessThan(Math.min(...second));
    expect(timeline?.getChildren()[2]?.vars.x).toBe(-COVER_NUDGE_REPEAT_DISTANCE_PX);
    expect(readX(stage)).toBe(0);
    expect(stage.style.transform).toBe("");
    expect(stage.style.transition).toBe("");
  });

  it("stops an active nudge and restores the stage for the view transition", () => {
    stubPrefersReducedMotion(false);
    const stage = buildStage();
    const timeline = buildCoverNudgeTimeline(stage);
    timeline?.progress(0.25, false);

    stopCoverNudge(stage);

    expect(timeline?.isActive()).toBe(false);
    expect(stage.style.transform).toBe("");
    expect(stage.style.transition).toBe("");
  });
});
