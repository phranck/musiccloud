/**
 * @file Unit tests for `getCreemClient` (MC-110). Both `creem` SDK and
 * `creem-config` are mocked so no real credentials or network calls are
 * required. The singleton behaviour and correct constructor arguments are the
 * primary concerns under test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the creem-config module so getCreemConfig is fully under our control.
vi.mock("../lib/creem-config.js", () => ({
  getCreemConfig: vi.fn(() => ({
    apiKey: "creem_test_x",
    mode: "test",
    webhookSecret: undefined,
  })),
}));

// Mock the creem SDK so no real HTTP client is constructed.
vi.mock("creem", () => ({
  Creem: vi.fn().mockImplementation(() => ({})),
  ServerTest: "test",
  ServerProd: "prod",
}));

describe("getCreemClient (MC-110)", () => {
  beforeEach(async () => {
    // Reset the singleton between tests by re-importing a fresh module, and
    // clear mock call counts so assertions in each test start from zero.
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns a defined client instance", async () => {
    const { getCreemClient } = await import("./creem-client.js");
    const client = getCreemClient();
    expect(client).toBeDefined();
  });

  it("returns the same instance on subsequent calls (singleton)", async () => {
    const { getCreemClient } = await import("./creem-client.js");
    const first = getCreemClient();
    const second = getCreemClient();
    expect(first).toBe(second);
  });

  it("constructs the Creem client exactly once across two calls", async () => {
    const { Creem } = await import("creem");
    const { getCreemClient } = await import("./creem-client.js");
    getCreemClient();
    getCreemClient();
    expect(Creem).toHaveBeenCalledTimes(1);
  });

  it("passes server 'test' and the apiKey to the Creem constructor for test-mode config", async () => {
    const { Creem } = await import("creem");
    const { getCreemClient } = await import("./creem-client.js");
    getCreemClient();
    expect(Creem).toHaveBeenCalledWith({
      server: "test",
      apiKey: "creem_test_x",
    });
  });
});
