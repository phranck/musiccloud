import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(import.meta.dirname, "../..");
const pricingPagePath = join(sourceRoot, "pages/pricing.astro");
const pricingCssPath = join(sourceRoot, "styles/pricing-material.css");
const tierColorPath = join(sourceRoot, "lib/tierColor.ts");
const planGridPath = join(sourceRoot, "components/plans/PlanGrid.astro");

describe("pricing material ownership", () => {
  it("owns pricing material in a dedicated tokenized stylesheet", () => {
    expect(existsSync(pricingCssPath)).toBe(true);
    const page = readFileSync(pricingPagePath, "utf8");
    const css = readFileSync(pricingCssPath, "utf8");

    // The stylesheet travels with the component that needs it, because the
    // plans now render on any page a writer puts `[[plans]]` on rather than
    // only on the one that used to import it.
    expect(readFileSync(planGridPath, "utf8")).toContain('import "@/styles/pricing-material.css"');
    // The plan cards moved into `PlanGrid.astro`, which is where a tier colour
    // now reaches a `style` attribute and therefore where it must be
    // normalised. The page itself renders no tier colour at all.
    expect(readFileSync(planGridPath, "utf8")).toContain("normalizeTierColor");
    expect(page).not.toContain("<style>");
    expect(css).toContain("--pricing-card-radius:");
    expect(css).toContain("--pricing-card-padding:");
    expect(css).toContain("--pricing-motion-duration:");
    expect(css).toContain("--pricing-billing-inset:");
    expect(css.match(/--pricing-card-radius:/g)).toHaveLength(1);
    expect(css.match(/--pricing-card-padding:/g)).toHaveLength(1);
    expect(css).not.toContain("pt-16");
    expect(css).toMatch(/\.billing-option\s*\{[^}]*min-height:\s*var\(--mc-size-control-compact\);/s);
    expect(css).toMatch(/\.tier-icon\s*\{[^}]*color:\s*var\(--color-on-accent\);/s);
    expect(page).not.toContain("sm:grid-cols-2");
  });

  it("leaves the commitment to the page's own copy", () => {
    const page = readFileSync(pricingPagePath, "utf8");
    const css = readFileSync(pricingCssPath, "utf8");

    // The commitment is four sentences somebody should be able to change in a
    // minute, so it is content now and this route renders it. What used to
    // style it went with the markup, and the copy is covered where it lives:
    // `apps/backend/src/services/__tests__/portal-pages.test.ts`.
    expect(page).toContain('fetchEditorialPage("/pricing")');
    expect(page).not.toContain("const commitments = [");
    expect(css).not.toContain("pricing-commitment");
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
