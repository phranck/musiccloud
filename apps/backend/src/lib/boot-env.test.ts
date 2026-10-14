/**
 * @file Unit tests for `assertRequiredBootEnv` (MC-110). Verifies that the
 * Creem consistency guard calls `getCreemConfig` when any Creem key variable is
 * present, propagates any throw from it, and skips the call entirely when no
 * Creem key variable is set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only getCreemConfig is replaced, so the guard's condition is the real one.
vi.mock("./creem-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./creem-config.js")>()),
  getCreemConfig: vi.fn(),
}));

/** A session secret of exactly the 32 bytes the boot requires. */
const USABLE_APP_SESSION_SECRET = "s".repeat(32);

describe("assertRequiredBootEnv (MC-110)", () => {
  beforeEach(() => {
    // Stub the JAMENDO_CLIENT_ID so the existing required-vars loop passes.
    vi.stubEnv("JAMENDO_CLIENT_ID", "test-jamendo-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it("calls getCreemConfig once when CREEM_API_KEY is set", async () => {
    vi.stubEnv("CREEM_API_KEY", "creem_test_abc");

    const { getCreemConfig } = await import("./creem-config.js");
    const { assertRequiredBootEnv } = await import("./boot-env.js");

    assertRequiredBootEnv();

    expect(getCreemConfig).toHaveBeenCalledOnce();
  });

  it("propagates a throw from getCreemConfig", async () => {
    vi.stubEnv("CREEM_API_KEY", "creem_test_abc");

    const { getCreemConfig } = await import("./creem-config.js");
    vi.mocked(getCreemConfig).mockImplementationOnce(() => {
      throw new Error("Creem config invalid");
    });

    const { assertRequiredBootEnv } = await import("./boot-env.js");

    expect(() => assertRequiredBootEnv()).toThrow("Creem config invalid");
  });

  it("refuses to boot a production process without INTERNAL_API_KEY", async () => {
    // Without the key the internal service-to-service boundary would be open,
    // so the process must not reach a serving state at all.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTERNAL_API_KEY", "");

    const { assertRequiredBootEnv } = await import("./boot-env.js");

    expect(() => assertRequiredBootEnv()).toThrow(/INTERNAL_API_KEY/);
  });

  it("boots a production process once INTERNAL_API_KEY and APP_SESSION_SECRET are set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTERNAL_API_KEY", "configured-key");
    vi.stubEnv("APP_SESSION_SECRET", USABLE_APP_SESSION_SECRET);

    const { assertRequiredBootEnv } = await import("./boot-env.js");

    expect(() => assertRequiredBootEnv()).not.toThrow();
  });

  it("refuses to boot a production process without APP_SESSION_SECRET", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTERNAL_API_KEY", "configured-key");
    vi.stubEnv("APP_SESSION_SECRET", "");

    const { assertRequiredBootEnv } = await import("./boot-env.js");

    expect(() => assertRequiredBootEnv()).toThrow(/APP_SESSION_SECRET/);
  });

  it.each(["production", "development"])("refuses an APP_SESSION_SECRET under 32 bytes in %s", async (nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("INTERNAL_API_KEY", "configured-key");
    vi.stubEnv("APP_SESSION_SECRET", "x".repeat(31));

    const { assertRequiredBootEnv } = await import("./boot-env.js");

    expect(() => assertRequiredBootEnv()).toThrow(/APP_SESSION_SECRET/);
  });

  it("does not require APP_SESSION_SECRET outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_SESSION_SECRET", "");

    const { assertRequiredBootEnv } = await import("./boot-env.js");

    expect(() => assertRequiredBootEnv()).not.toThrow();
  });

  it("does not require INTERNAL_API_KEY outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("INTERNAL_API_KEY", "");

    const { assertRequiredBootEnv } = await import("./boot-env.js");

    expect(() => assertRequiredBootEnv()).not.toThrow();
  });

  it("does NOT call getCreemConfig when no Creem key variable is set", async () => {
    vi.stubEnv("CREEM_API_KEY", "");
    vi.stubEnv("CREEM_TEST_API_KEY", "");
    vi.stubEnv("CREEM_LIVE_API_KEY", "");

    const { getCreemConfig } = await import("./creem-config.js");
    const { assertRequiredBootEnv } = await import("./boot-env.js");

    assertRequiredBootEnv();

    expect(getCreemConfig).not.toHaveBeenCalled();
  });

  it.each([
    "CREEM_TEST_API_KEY",
    "CREEM_LIVE_API_KEY",
  ])("checks the configuration when only %s is set", async (variable) => {
    vi.stubEnv("CREEM_API_KEY", "");
    vi.stubEnv("CREEM_TEST_API_KEY", "");
    vi.stubEnv("CREEM_LIVE_API_KEY", "");
    vi.stubEnv(variable, "creem_some_key");

    const { getCreemConfig } = await import("./creem-config.js");
    const { assertRequiredBootEnv } = await import("./boot-env.js");

    assertRequiredBootEnv();

    expect(getCreemConfig).toHaveBeenCalledOnce();
  });
});
