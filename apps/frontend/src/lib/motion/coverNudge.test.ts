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

function sampleChild(stage: HTMLElement, timeline: gsap.core.Timeline, index: number): number[] {
  const child = timeline.getChildren()[index];
  if (!child) return [];
  return Array.from({ length: 201 }, (_, step) => {
    timeline.time(child.startTime() + (child.duration() * step) / 200, false);
    return readX(stage);
  });
}

function countTurningPoints(values: number[]): number {
  let previousDirection = 0;
  let turns = 0;
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    if (Math.abs(delta) < 0.0001) continue;
    const direction = Math.sign(delta);
    if (previousDirection !== 0 && direction !== previousDirection) turns += 1;
    previousDirection = direction;
  }
  return turns;
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

  it("swipes left twice, springs back dynamically, and settles without inline styles", () => {
    stubPrefersReducedMotion(false);
    const stage = buildStage();
    const timeline = buildCoverNudgeTimeline(stage);
    expect(timeline).not.toBeNull();

    const first: number[] = [];
    const second: number[] = [];
    const samples = 400;
    for (let step = 0; step <= samples; step += 1) {
      timeline?.progress(step / samples, false);
      expect(gsap.getProperty(stage, "y")).toBe(0);
      const x = readX(stage);
      if (step <= samples / 2) first.push(x);
      else second.push(x);
    }

    const children = timeline?.getChildren();
    expect(children?.[0]?.duration()).toBeLessThan(children?.[1]?.duration() ?? 0);
    expect(Math.min(...first)).toBeCloseTo(-COVER_NUDGE_DISTANCE_PX, 0);
    expect(Math.max(...first)).toBeGreaterThan(0);
    expect(Math.min(...second)).toBeCloseTo(-COVER_NUDGE_REPEAT_DISTANCE_PX, 0);
    expect(Math.max(...second)).toBeGreaterThan(0);
    expect(Math.max(...second)).toBeLessThan(Math.max(...first));
    expect(countTurningPoints(sampleChild(stage, timeline!, 1))).toBe(1);
    expect(countTurningPoints(sampleChild(stage, timeline!, 3))).toBe(1);
    expect(children?.[2]?.vars.x).toBe(-COVER_NUDGE_REPEAT_DISTANCE_PX);
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
