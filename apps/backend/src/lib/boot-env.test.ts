/**
 * @file Unit tests for {@link assertRequiredBootEnv} -- specifically the
 * optional Polar consistency guard that fires only when `POLAR_ACCESS_TOKEN` is
 * present in the environment. Each test stubs exactly the env vars it needs and
 * restores everything in `afterEach` via `vi.unstubAllEnvs()`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./polar-config.js", () => ({
  getPolarConfig: vi.fn(),
}));

import { assertRequiredBootEnv } from "./boot-env.js";
import { getPolarConfig } from "./polar-config.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("assertRequiredBootEnv", () => {
  describe("Polar guard", () => {
    it("calls getPolarConfig when POLAR_ACCESS_TOKEN is set", () => {
      vi.stubEnv("JAMENDO_CLIENT_ID", "test-jamendo");
      vi.stubEnv("POLAR_ACCESS_TOKEN", "tok");
      vi.mocked(getPolarConfig).mockReturnValue({
        server: "sandbox",
        accessToken: "tok",
        webhookSecret: undefined,
        products: {},
      });

      assertRequiredBootEnv();

      expect(getPolarConfig).toHaveBeenCalledOnce();
    });

    it("propagates a throw from getPolarConfig when the Polar config is broken", () => {
      vi.stubEnv("JAMENDO_CLIENT_ID", "test-jamendo");
      vi.stubEnv("POLAR_ACCESS_TOKEN", "tok");
      vi.mocked(getPolarConfig).mockImplementation(() => {
        throw new Error('POLAR_SERVER must be "sandbox" or "production", got "bad".');
      });

      expect(() => assertRequiredBootEnv()).toThrow(/POLAR_SERVER/);
    });

    it("does NOT call getPolarConfig when POLAR_ACCESS_TOKEN is absent", () => {
      vi.stubEnv("JAMENDO_CLIENT_ID", "test-jamendo");
      // POLAR_ACCESS_TOKEN is intentionally not set here.

      assertRequiredBootEnv();

      expect(getPolarConfig).not.toHaveBeenCalled();
    });
  });
});
