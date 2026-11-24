import { describe, expect, it, vi } from "vitest";

/**
 * The mocked `ALLOWED_ORIGINS` entries: the production origin, first in the
 * list and therefore the default, and a local frontend origin.
 */
const { PRODUCTION_ORIGIN, LOCAL_ORIGIN } = vi.hoisted(() => ({
  PRODUCTION_ORIGIN: "https://musiccloud.io",
  LOCAL_ORIGIN: "http://localhost:3000",
}));

vi.mock("../env.js", () => ({ requireEnvList: () => [PRODUCTION_ORIGIN, LOCAL_ORIGIN] }));

const { shortUrlOrigin } = await import("./allowed-origin.js");

describe("shortUrlOrigin", () => {
  it("keeps an allowed origin", () => {
    expect(shortUrlOrigin(LOCAL_ORIGIN)).toBe(LOCAL_ORIGIN);
  });

  it("falls back to the first allowed origin for an unknown origin", () => {
    expect(shortUrlOrigin("https://attacker.example")).toBe(PRODUCTION_ORIGIN);
  });

  it("falls back to the first allowed origin when the header is missing", () => {
    expect(shortUrlOrigin(undefined)).toBe(PRODUCTION_ORIGIN);
  });
});
