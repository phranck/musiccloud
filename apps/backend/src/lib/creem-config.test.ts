/**
 * @file Unit tests for the Creem configuration. Env vars are stubbed via
 * `vi.stubEnv`, so no real environment and no real Creem credentials are
 * needed.
 *
 * The question under test is which environments a deployment can reach and
 * with which key. Getting that wrong is the failure that charges the wrong
 * people or nobody, so every case where the answer is ambiguous ends in a
 * throw rather than a guess.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Imports the module fresh, so it reads whatever env the test has stubbed. */
async function loadConfig() {
  return import("./creem-config.js");
}

beforeEach(() => {
  vi.stubEnv("CREEM_API_KEY", "");
  vi.stubEnv("CREEM_TEST_API_KEY", "");
  vi.stubEnv("CREEM_LIVE_API_KEY", "");
  vi.stubEnv("CREEM_WEBHOOK_SECRET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getCreemConfig", () => {
  it("holds a key per environment when both are configured", async () => {
    vi.stubEnv("CREEM_TEST_API_KEY", "creem_test_abc");
    vi.stubEnv("CREEM_LIVE_API_KEY", "creem_live_xyz");
    const { getCreemConfig } = await loadConfig();

    expect(getCreemConfig().apiKeys).toEqual({ test: "creem_test_abc", live: "creem_live_xyz" });
  });

  it("holds no key at all when none is configured, rather than throwing", async () => {
    const { getCreemConfig } = await loadConfig();

    expect(getCreemConfig().apiKeys).toEqual({});
  });

  it("reads CREEM_WEBHOOK_SECRET when it is set", async () => {
    vi.stubEnv("CREEM_TEST_API_KEY", "creem_test_abc");
    vi.stubEnv("CREEM_WEBHOOK_SECRET", "whsec_example");
    const { getCreemConfig } = await loadConfig();

    expect(getCreemConfig().webhookSecret).toBe("whsec_example");
  });

  it("puts the legacy single key into the environment its own prefix names", async () => {
    vi.stubEnv("CREEM_API_KEY", "creem_test_abc");
    const { getCreemConfig } = await loadConfig();

    expect(getCreemConfig().apiKeys).toEqual({ test: "creem_test_abc" });
  });

  it("treats a legacy key without the test prefix as a live key", async () => {
    vi.stubEnv("CREEM_API_KEY", "creem_live_xyz");
    const { getCreemConfig } = await loadConfig();

    expect(getCreemConfig().apiKeys).toEqual({ live: "creem_live_xyz" });
  });

  it("refuses a sandbox key sitting in the live variable", async () => {
    vi.stubEnv("CREEM_LIVE_API_KEY", "creem_test_abc");
    const { getCreemConfig } = await loadConfig();

    expect(() => getCreemConfig()).toThrow(/CREEM_LIVE_API_KEY holds a test key/);
  });

  it("refuses a live key sitting in the test variable", async () => {
    vi.stubEnv("CREEM_TEST_API_KEY", "creem_live_xyz");
    const { getCreemConfig } = await loadConfig();

    expect(() => getCreemConfig()).toThrow(/CREEM_TEST_API_KEY holds a live key/);
  });

  it("refuses two different keys naming the same environment", async () => {
    vi.stubEnv("CREEM_TEST_API_KEY", "creem_test_abc");
    vi.stubEnv("CREEM_API_KEY", "creem_test_other");
    const { getCreemConfig } = await loadConfig();

    expect(() => getCreemConfig()).toThrow(/both name the test environment/);
  });

  it("accepts the same key in both the legacy and the explicit variable", async () => {
    vi.stubEnv("CREEM_TEST_API_KEY", "creem_test_abc");
    vi.stubEnv("CREEM_API_KEY", "creem_test_abc");
    const { getCreemConfig } = await loadConfig();

    expect(getCreemConfig().apiKeys).toEqual({ test: "creem_test_abc" });
  });
});

describe("configuredCreemModes", () => {
  it("names only the environments a key exists for, test first", async () => {
    vi.stubEnv("CREEM_LIVE_API_KEY", "creem_live_xyz");
    vi.stubEnv("CREEM_TEST_API_KEY", "creem_test_abc");
    const { configuredCreemModes } = await loadConfig();

    expect(configuredCreemModes()).toEqual(["test", "live"]);
  });

  it("is empty when Creem is not wired at all", async () => {
    const { configuredCreemModes } = await loadConfig();

    expect(configuredCreemModes()).toEqual([]);
  });
});

describe("requireCreemApiKey", () => {
  it("returns the key for the environment asked for", async () => {
    vi.stubEnv("CREEM_TEST_API_KEY", "creem_test_abc");
    vi.stubEnv("CREEM_LIVE_API_KEY", "creem_live_xyz");
    const { requireCreemApiKey } = await loadConfig();

    expect(requireCreemApiKey("live")).toBe("creem_live_xyz");
  });

  it("names the variable to set rather than falling back to the other account", async () => {
    vi.stubEnv("CREEM_TEST_API_KEY", "creem_test_abc");
    const { requireCreemApiKey } = await loadConfig();

    expect(() => requireCreemApiKey("live")).toThrow(/CREEM_LIVE_API_KEY/);
  });
});
