/**
 * @file Unit tests for `assertRequiredBootEnv` (MC-110). Verifies that the
 * Creem consistency guard calls `getCreemConfig` when `CREEM_API_KEY` is
 * present, propagates any throw from it, and skips the call entirely when
 * `CREEM_API_KEY` is absent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the creem-config module so we can spy on / control getCreemConfig.
vi.mock("./creem-config.js", () => ({
  getCreemConfig: vi.fn(),
}));

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

  it("does NOT call getCreemConfig when CREEM_API_KEY is absent", async () => {
    // Ensure CREEM_API_KEY is not set.
    vi.unstubAllEnvs();
    vi.stubEnv("JAMENDO_CLIENT_ID", "test-jamendo-id");
    delete process.env.CREEM_API_KEY;

    const { getCreemConfig } = await import("./creem-config.js");
    const { assertRequiredBootEnv } = await import("./boot-env.js");

    assertRequiredBootEnv();

    expect(getCreemConfig).not.toHaveBeenCalled();
  });
});
