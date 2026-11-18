/**
 * @file Unit tests for the Enable Banking configuration. The variables are
 * stubbed with `vi.stubEnv`, so no real credential is involved.
 *
 * The two variables are one credential in two halves, so the question under
 * test is whether a deployment holds both, neither, or a half that must stop
 * the boot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** An application id of the shape Enable Banking issues. */
const APPLICATION_ID = "0b6c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4";

/** Stands in for a key; the config reads it and never parses it. */
const PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nline-one\\nline-two\\n-----END PRIVATE KEY-----";

/** Imports the module fresh, so it reads whatever env the test has stubbed. */
async function loadConfig() {
  return import("./enable-banking-config.js");
}

beforeEach(() => {
  vi.stubEnv("ENABLE_BANKING_APPLICATION_ID", "");
  vi.stubEnv("ENABLE_BANKING_PRIVATE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getEnableBankingConfig", () => {
  it("holds no credential when neither half is set, rather than throwing", async () => {
    const { getEnableBankingConfig, isEnableBankingConfigured } = await loadConfig();

    expect(getEnableBankingConfig()).toBeNull();
    expect(isEnableBankingConfigured()).toBe(false);
  });

  it("holds both halves, with the key's written-out line breaks turned back into breaks", async () => {
    vi.stubEnv("ENABLE_BANKING_APPLICATION_ID", APPLICATION_ID);
    vi.stubEnv("ENABLE_BANKING_PRIVATE_KEY", PRIVATE_KEY);
    const { getEnableBankingConfig, isEnableBankingConfigured } = await loadConfig();

    expect(getEnableBankingConfig()).toEqual({
      applicationId: APPLICATION_ID,
      privateKey: "-----BEGIN PRIVATE KEY-----\nline-one\nline-two\n-----END PRIVATE KEY-----",
    });
    expect(isEnableBankingConfigured()).toBe(true);
  });

  it("refuses the application id without the key, and names the missing variable", async () => {
    vi.stubEnv("ENABLE_BANKING_APPLICATION_ID", APPLICATION_ID);
    const { getEnableBankingConfig } = await loadConfig();

    expect(() => getEnableBankingConfig()).toThrow(/ENABLE_BANKING_PRIVATE_KEY/);
  });

  it("refuses the key without the application id, and names the missing variable", async () => {
    vi.stubEnv("ENABLE_BANKING_PRIVATE_KEY", PRIVATE_KEY);
    const { getEnableBankingConfig } = await loadConfig();

    expect(() => getEnableBankingConfig()).toThrow(/ENABLE_BANKING_APPLICATION_ID/);
  });

  it("refuses an application id that is not a UUID", async () => {
    vi.stubEnv("ENABLE_BANKING_APPLICATION_ID", "application-id");
    vi.stubEnv("ENABLE_BANKING_PRIVATE_KEY", PRIVATE_KEY);
    const { getEnableBankingConfig } = await loadConfig();

    expect(() => getEnableBankingConfig()).toThrow(/ENABLE_BANKING_APPLICATION_ID must be a UUID/);
  });

  it("never puts the key into a refusal", async () => {
    vi.stubEnv("ENABLE_BANKING_APPLICATION_ID", "application-id");
    vi.stubEnv("ENABLE_BANKING_PRIVATE_KEY", PRIVATE_KEY);
    const { getEnableBankingConfig } = await loadConfig();

    expect(() => getEnableBankingConfig()).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("line-one") }),
    );
  });
});
