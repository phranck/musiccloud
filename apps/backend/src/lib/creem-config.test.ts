/**
 * @file Unit tests for `getCreemConfig` (MC-110). Env vars are stubbed via
 * `vi.stubEnv` so no real environment and no real Creem credentials are
 * required. The test/live mode derivation from the API key prefix is the
 * primary concern under test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("getCreemConfig (MC-110)", () => {
  beforeEach(() => {
    // Clear any existing CREEM_* env vars before each test so that stubs
    // from one test cannot bleed into the next.
    vi.stubEnv("CREEM_API_KEY", "");
    vi.stubEnv("CREEM_WEBHOOK_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns mode 'test' and no webhookSecret when key starts with creem_test_", async () => {
    vi.stubEnv("CREEM_API_KEY", "creem_test_abc");
    // Dynamic import so the module reads the stubbed env at call time.
    const { getCreemConfig } = await import("./creem-config.js");
    expect(getCreemConfig()).toEqual({
      apiKey: "creem_test_abc",
      mode: "test",
      webhookSecret: undefined,
    });
  });

  it("returns mode 'live' when key does not start with creem_test_", async () => {
    vi.stubEnv("CREEM_API_KEY", "creem_live_xyz");
    const { getCreemConfig } = await import("./creem-config.js");
    expect(getCreemConfig()).toEqual({
      apiKey: "creem_live_xyz",
      mode: "live",
      webhookSecret: undefined,
    });
  });

  it("returns webhookSecret when CREEM_WEBHOOK_SECRET is set", async () => {
    vi.stubEnv("CREEM_API_KEY", "creem_test_abc");
    vi.stubEnv("CREEM_WEBHOOK_SECRET", "whsec_example");
    const { getCreemConfig } = await import("./creem-config.js");
    expect(getCreemConfig()).toEqual({
      apiKey: "creem_test_abc",
      mode: "test",
      webhookSecret: "whsec_example",
    });
  });

  it("throws when CREEM_API_KEY is missing", async () => {
    // Remove the stub so the var is absent from process.env.
    vi.unstubAllEnvs();
    delete process.env.CREEM_API_KEY;
    const { getCreemConfig } = await import("./creem-config.js");
    expect(() => getCreemConfig()).toThrow(/CREEM_API_KEY/);
  });
});
