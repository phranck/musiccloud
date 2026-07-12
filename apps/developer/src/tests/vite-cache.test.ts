import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("developer Vite cache", () => {
  it("keeps development and production dependency caches isolated", () => {
    const config = readFileSync(join(import.meta.dirname, "../../astro.config.mjs"), "utf8");

    expect(config).toContain('const viteCacheDir = process.argv.includes("build")');
    expect(config).toContain('"node_modules/.vite-build"');
    expect(config).toContain('"node_modules/.vite-dev"');
    expect(config).toContain("cacheDir: viteCacheDir");
  });
});
