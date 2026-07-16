import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(import.meta.dirname, "../..");
const pricingPagePath = join(sourceRoot, "pages/pricing.astro");
const pricingCssPath = join(sourceRoot, "styles/pricing-material.css");
const tierColorPath = join(sourceRoot, "lib/tierColor.ts");

describe("pricing material ownership", () => {
  it("owns pricing material in a dedicated tokenized stylesheet", () => {
    expect(existsSync(pricingCssPath)).toBe(true);
    const page = readFileSync(pricingPagePath, "utf8");
    const css = readFileSync(pricingCssPath, "utf8");

    expect(page).toContain('import "../styles/pricing-material.css"');
    expect(page).toContain("normalizeTierColor");
    expect(page).not.toContain("<style>");
    expect(css).toContain("--pricing-card-radius:");
    expect(css).toContain("--pricing-card-padding:");
    expect(css).toContain("--pricing-motion-duration:");
    expect(css).toContain("--pricing-billing-inset:");
    expect(css.match(/--pricing-card-radius:/g)).toHaveLength(1);
    expect(css.match(/--pricing-card-padding:/g)).toHaveLength(1);
    expect(css).not.toContain("pt-16");
    expect(css).toMatch(/\.billing-option\s*\{[^}]*min-height:\s*var\(--mc-size-control\);/s);
    expect(css).toMatch(/\.tier-icon\s*\{[^}]*color:\s*var\(--color-on-accent\);/s);
    expect(page).not.toContain("sm:grid-cols-2");
  });

  it("accepts only six- or eight-digit tier hex colors", async () => {
    expect(existsSync(tierColorPath)).toBe(true);
    if (!existsSync(tierColorPath)) return;

    const { normalizeTierColor } = await import("../../lib/tierColor");
    expect(normalizeTierColor("#12aBcD")).toBe("#12aBcD");
    expect(normalizeTierColor("#12aBcDff")).toBe("#12aBcDff");
    expect(normalizeTierColor("red")).toBe("var(--mc-color-accent)");
    expect(normalizeTierColor("#fff; background:red")).toBe("var(--mc-color-accent)");
  });
});
