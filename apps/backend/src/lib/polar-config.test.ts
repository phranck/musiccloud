/**
 * @file Unit tests for {@link getPolarConfig} -- the single, validated entry
 * point for reading the Polar billing env. Each test stubs exactly the env vars
 * it needs and restores everything in `afterEach` via `vi.unstubAllEnvs()`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { getPolarConfig } from "./polar-config.js";

/** Minimal valid env used by the happy-path test. */
const VALID_ENV = {
  POLAR_SERVER: "sandbox",
  POLAR_ACCESS_TOKEN: "tok",
  POLAR_PRODUCTS: '{"tier_club":{"month":"prod_m","year":"prod_y"}}',
} as const;

/** Stubs all vars in the record via `vi.stubEnv`. */
function stubEnvRecord(record: Record<string, string>): void {
  for (const [key, value] of Object.entries(record)) {
    vi.stubEnv(key, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPolarConfig", () => {
  describe("happy path", () => {
    it("returns validated config when all required env vars are set correctly", () => {
      stubEnvRecord(VALID_ENV);
      expect(getPolarConfig()).toEqual({
        server: "sandbox",
        accessToken: "tok",
        products: { tier_club: { month: "prod_m", year: "prod_y" } },
        webhookSecret: undefined,
      });
    });

    it("returns production server when POLAR_SERVER is 'production'", () => {
      stubEnvRecord({ ...VALID_ENV, POLAR_SERVER: "production" });
      expect(getPolarConfig().server).toBe("production");
    });

    it("includes webhookSecret when POLAR_WEBHOOK_SECRET is set", () => {
      stubEnvRecord({ ...VALID_ENV, POLAR_WEBHOOK_SECRET: "whsec_abc" });
      expect(getPolarConfig().webhookSecret).toBe("whsec_abc");
    });

    it("maps multiple tier entries correctly", () => {
      stubEnvRecord({
        ...VALID_ENV,
        POLAR_PRODUCTS: JSON.stringify({
          tier_club: { month: "m1", year: "y1" },
          tier_pro: { month: "m2", year: "y2" },
        }),
      });
      expect(getPolarConfig().products).toEqual({
        tier_club: { month: "m1", year: "y1" },
        tier_pro: { month: "m2", year: "y2" },
      });
    });
  });

  describe("error cases", () => {
    it("throws when POLAR_SERVER is not 'sandbox' or 'production'", () => {
      stubEnvRecord({ ...VALID_ENV, POLAR_SERVER: "foo" });
      expect(() => getPolarConfig()).toThrow(/POLAR_SERVER/);
    });

    it("throws when POLAR_PRODUCTS is not valid JSON", () => {
      stubEnvRecord({ ...VALID_ENV, POLAR_PRODUCTS: "{invalid" });
      expect(() => getPolarConfig()).toThrow(/POLAR_PRODUCTS/);
    });

    it("throws when a product entry is missing the month field", () => {
      stubEnvRecord({
        ...VALID_ENV,
        POLAR_PRODUCTS: JSON.stringify({ tier_club: { year: "prod_y" } }),
      });
      expect(() => getPolarConfig()).toThrow(/POLAR_PRODUCTS/);
    });

    it("throws when a product entry is missing the year field", () => {
      stubEnvRecord({
        ...VALID_ENV,
        POLAR_PRODUCTS: JSON.stringify({ tier_club: { month: "prod_m" } }),
      });
      expect(() => getPolarConfig()).toThrow(/POLAR_PRODUCTS/);
    });

    it("throws when POLAR_PRODUCTS is a JSON array instead of an object", () => {
      stubEnvRecord({ ...VALID_ENV, POLAR_PRODUCTS: "[]" });
      expect(() => getPolarConfig()).toThrow(/POLAR_PRODUCTS/);
    });

    it("throws when POLAR_ACCESS_TOKEN is missing", () => {
      stubEnvRecord({ POLAR_SERVER: "sandbox", POLAR_PRODUCTS: VALID_ENV.POLAR_PRODUCTS });
      expect(() => getPolarConfig()).toThrow(/POLAR_ACCESS_TOKEN/);
    });
  });
});
