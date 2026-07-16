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
    expect(css).toMatch(/\.billing-option\s*\{[^}]*min-height:\s*var\(--mc-size-control-compact\);/s);
    expect(css).toMatch(/\.tier-icon\s*\{[^}]*color:\s*var\(--color-on-accent\);/s);
    expect(page).not.toContain("sm:grid-cols-2");
  });

  it("splits the written commitment into two shared cards side by side", () => {
    const page = readFileSync(pricingPagePath, "utf8");
    const css = readFileSync(pricingCssPath, "utf8");

    expect(page).toContain('import { SurfaceCard } from "@/components/SurfaceCard";');
    expect(page).toContain("const commitmentGroups = [");
    expect(page).toContain('class="pricing-commitment-grid"');
    expect(page).toContain('<SurfaceCard className="pricing-commitment-card"');
    expect(page).toContain("<SurfaceCard.Body>");
    expect(page).not.toContain('<ul class="rounded-card border border-border bg-surface px-7 py-7');
    expect(css).toMatch(
      /\.pricing-commitment-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[^}]*gap:\s*var\(--mc-space-4\);/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 47\.999rem\)[\s\S]*\.pricing-commitment-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
    );
  });

  it("renders every commitment title and explanation on separate lines", () => {
    const page = readFileSync(pricingPagePath, "utf8");

    expect(page).toContain('<span class="pricing-commitment-copy text-fg-muted">');
    expect(page).toContain('<strong class="pricing-commitment-title text-fg">{commitment.title}</strong>');
    expect(page).toContain('<span class="pricing-commitment-body">{commitment.body}</span>');
  });

  it("keeps commitment markers large and optically centered", () => {
    const page = readFileSync(pricingPagePath, "utf8");
    const css = readFileSync(pricingCssPath, "utf8");

    expect(page).toContain('class="icon-text-first-line__icon pricing-commitment-icon"');
    expect(css).toMatch(/\.pricing-commitment-icon\s*\{[^}]*--mc-size-text-icon:\s*var\(--mc-size-icon-lg\);/s);
    expect(css).toMatch(/\.pricing-commitment-icon\s*\{[^}]*transform:\s*translateY\(1px\);/s);
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
