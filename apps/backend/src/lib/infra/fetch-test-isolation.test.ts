/**
 * @file Holds the test setup to what `vitest.setup.ts` promises: a backend test
 * that mocks `fetch` reaches no network at all, DNS included.
 */
import { describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./fetch.js";

describe("outbound requests under test", () => {
  it("reach the mocked fetch without a DNS answer from the network", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("answered"));

    // `.invalid` never resolves on a real network, so this only passes when the
    // lookup is the setup's mock.
    const response = await fetchWithTimeout("https://no-such-host.invalid/path");

    expect(await response.text()).toBe("answered");
  });
});
