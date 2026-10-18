import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const stylesheet = document.createElement("style");

beforeAll(() => {
  stylesheet.textContent = readFileSync(resolve("src/styles/animations.css"), "utf8");
  document.head.append(stylesheet);
});

afterAll(() => stylesheet.remove());

describe("track preview frame motion", () => {
  it("pulses only a playing row when motion is allowed", () => {
    const media = Array.from(stylesheet.sheet?.cssRules ?? [])
      .filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule)
      .find((rule) => rule.conditionText === "(prefers-reduced-motion: no-preference)");
    const playing = Array.from(media?.cssRules ?? [])
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .find((rule) => rule.selectorText === '.mc-playback-row[data-playback="playing"]::before');

    expect(playing?.style.animation).toBe("mc-playback-pulse 3s ease-in-out infinite");
    expect(Array.from(media?.cssRules ?? [])).toHaveLength(1);
  });

  it("varies only frame opacity and never makes the playing frame disappear", () => {
    const pulse = Array.from(stylesheet.sheet?.cssRules ?? [])
      .filter((rule): rule is CSSKeyframesRule => rule instanceof CSSKeyframesRule)
      .find((rule) => rule.name === "mc-playback-pulse");
    const frames = Array.from(pulse?.cssRules ?? []).filter(
      (rule): rule is CSSKeyframeRule => rule instanceof CSSKeyframeRule,
    );

    expect(frames.length).toBeGreaterThanOrEqual(2);
    for (const frame of frames) {
      expect(Array.from(frame.style)).toEqual(["opacity"]);
      expect(Number(frame.style.opacity)).toBeGreaterThan(0);
      expect(Number(frame.style.opacity)).toBeLessThanOrEqual(1);
    }
    expect(new Set(frames.map((frame) => frame.style.opacity)).size).toBeGreaterThan(1);
  });

  it("keeps paused and reduced-motion frames static", () => {
    const rules = Array.from(stylesheet.sheet?.cssRules ?? []).filter(
      (rule): rule is CSSStyleRule => rule instanceof CSSStyleRule,
    );
    const frame = rules.find((rule) => rule.selectorText === ".mc-playback-row::before");
    const heldFrame = rules.find((rule) => rule.selectorText === ".mc-playback-row[data-playback]::before");

    expect(frame?.style.opacity).toBe("0");
    expect(heldFrame?.style.opacity).toBe("1");
    expect(rules.filter((rule) => rule.selectorText.includes("mc-playback-row") && rule.style.animation)).toEqual([]);
  });
});
