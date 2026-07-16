import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { maskToken } from "@/lib/apiAccessClient";

describe("released API-key presentation", () => {
  it("uses the released mc_live shape in the landing-page example", () => {
    const page = readFileSync(join(import.meta.dirname, "../../pages/index.astro"), "utf8");

    expect(page).toContain("X-API-Key: mc_live_example12345_replace_with_your_secret_value");
    expect(page).not.toContain("00000000-0000-4000-8000-000000000000");
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
