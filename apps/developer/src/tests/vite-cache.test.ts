import { describe, expect, it } from "vitest";
import config from "../../astro.config.mjs";

describe("developer Vite cache", () => {
  it("reads the cache directory from the command the developer portal runs", () => {
    expect(config.vite?.cacheDir).toBe("node_modules/.vite");
  });
});
