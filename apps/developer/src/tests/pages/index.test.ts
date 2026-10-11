import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { maskToken } from "@/lib/apiAccessClient";

describe("released API-key presentation", () => {
  it("uses the released mc_live shape in the landing-page example", () => {
    // The home page's copy is edited in the dashboard now, so the example key
    // lives with the copy the page is created with rather than in the route.
    const seed = readFileSync(
      join(import.meta.dirname, "../../../../backend/src/services/content/portal-home-page.ts"),
      "utf8",
    );

    expect(seed).toContain("X-API-Key: mc_live_example12345_replace_with_your_secret_value");
    expect(seed).not.toContain("00000000-0000-4000-8000-000000000000");
  });

  it("masks stored token prefixes with the released public-key envelope", () => {
    expect(maskToken("abc123def456")).toBe("mc_live_abc123def456_...");
  });
});

describe("documentation landing page", () => {
  it("does not render the redundant API-reference and signup CTA buttons", () => {
    const page = readFileSync(join(import.meta.dirname, "../../pages/docs/index.astro"), "utf8");

    expect(page).not.toContain("Open generated API reference");
    expect(page).not.toContain("Create an account");
    expect(page).not.toContain('href="/docs/api"');
    expect(page).not.toContain('href="/signup"');
  });
});
