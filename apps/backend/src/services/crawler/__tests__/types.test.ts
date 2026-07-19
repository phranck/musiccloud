import { describe, expect, it, vi } from "vitest";
import { type CrawlerSource, validateCrawlerSourceExecution } from "../types.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("validateCrawlerSourceExecution", () => {
  it("waits for async availability before returning normalized configuration", async () => {
    const availability = deferred<void>();
    const source: CrawlerSource = {
      id: "test-source",
      displayName: "Test Source",
      defaultIntervalMinutes: 360,
      defaultEnabled: false,
      defaultConfig: {},
      parseConfig: vi.fn(() => ({ storefront: "us" })),
      assertAvailable: vi.fn(() => availability.promise),
      fetch: vi.fn(),
    };

    const validation = validateCrawlerSourceExecution(source, { storefront: "US" });

    expect(validation).toBeInstanceOf(Promise);
    availability.resolve();
    await expect(validation).resolves.toEqual({ storefront: "us" });
  });
});
