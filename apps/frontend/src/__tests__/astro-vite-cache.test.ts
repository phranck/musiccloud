// @vitest-environment node
import { describe, expect, it } from "vitest";
import { astroViteCacheDir } from "../../../../scripts/astro-vite-cache-dir.mjs";
import config from "../../astro.config.mjs";

describe("Astro Vite cache", () => {
  it("keeps the dev server's cache out of reach of every other command", () => {
    expect(astroViteCacheDir(["node", "astro.js", "dev"])).toBe("node_modules/.vite-dev");
    for (const command of ["build", "check", "sync", "preview"]) {
      expect(astroViteCacheDir(["node", "astro.js", command]), command).toBe("node_modules/.vite");
    }
  });

  it("reads the cache directory from the command the frontend runs", () => {
    expect(config.vite?.cacheDir).toBe("node_modules/.vite");
  });
});
