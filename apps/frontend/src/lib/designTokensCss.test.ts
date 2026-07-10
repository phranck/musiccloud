import { DESIGN_TOKENS_DEFAULTS } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { designTokensToCss } from "./designTokensCss";

/** Extracts an `rgba(r,g,b,a)` CSS var's channel sum + alpha from the emitted block. */
function rgbaVar(css: string, varName: string): { sum: number; alpha: string } {
  const m = css.match(new RegExp(`${varName}:rgba\\((\\d+),(\\d+),(\\d+),([0-9.]+)\\)`));
  if (!m) throw new Error(`expected var ${varName} as rgba(...) in emitted CSS`);
  return { sum: Number(m[1]) + Number(m[2]) + Number(m[3]), alpha: m[4] };
}

describe("designTokensToCss — button hover/active tints", () => {
  const css = designTokensToCss(DESIGN_TOKENS_DEFAULTS);

  it("emits HSL-lifted hover + active button tint vars for both modes", () => {
    for (const v of ["--button-day-ht", "--button-night-ht", "--button-day-at", "--button-night-at"]) {
      expect(css).toContain(`${v}:`);
    }
  });

  it("lifts hover lighter than base, active between, with the base tint's opacity preserved", () => {
    const base = rgbaVar(css, "--button-night-t");
    const hover = rgbaVar(css, "--button-night-ht");
    const active = rgbaVar(css, "--button-night-at");
    // Lightness lift raises the channels (the tint gets lighter); hover > active > base.
    expect(hover.sum).toBeGreaterThan(active.sum);
    expect(active.sum).toBeGreaterThan(base.sum);
    // Only the lightness changes — the alpha stays the configured tint opacity.
    expect(hover.alpha).toBe(base.alpha);
    expect(active.alpha).toBe(base.alpha);
  });
});

describe("designTokensToCss — global drop shadow", () => {
  it("emits the drop-shadow geometry vars from tokens.shadow.shadow", () => {
    const css = designTokensToCss(DESIGN_TOKENS_DEFAULTS);
    expect(css).toContain("--mc-shadow-x:0px");
    expect(css).toContain("--mc-shadow-y:15px");
    expect(css).toContain("--mc-shadow-blur:21px");
    expect(css).toContain("--mc-shadow-rgb:0,0,0");
  });
});
