import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpiringValueCache, throwOnEmpty } from "../expiring-value-cache.js";

/** Lifetime of the values in these cases. */
const TTL_MS = 1000;
/** Refresh margin of the cases that use one. */
const MARGIN_MS = 100;

/** A loader that answers `value-1`, `value-2`, ... and counts its calls. */
function countingLoader() {
  let calls = 0;
  const load = vi.fn(async () => {
    calls += 1;
    return `value-${calls}`;
  });
  return load;
}

describe("ExpiringValueCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers the cached value until its time to live ends, then loads again", async () => {
    const load = countingLoader();
    const cache = new ExpiringValueCache({ load, timeToLiveMs: TTL_MS });

    expect(await cache.get()).toBe("value-1");
    vi.setSystemTime(TTL_MS - 1);
    expect(await cache.get()).toBe("value-1");
    vi.setSystemTime(TTL_MS);
    expect(await cache.get()).toBe("value-2");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("treats a value as stale once it is within the refresh margin of its end", async () => {
    const load = countingLoader();
    const cache = new ExpiringValueCache({ load, timeToLiveMs: TTL_MS, refreshMarginMs: MARGIN_MS });

    await cache.get();
    vi.setSystemTime(TTL_MS - MARGIN_MS - 1);
    expect(await cache.get()).toBe("value-1");
    vi.setSystemTime(TTL_MS - MARGIN_MS);
    expect(await cache.get()).toBe("value-2");
  });

  it("takes the time to live from the loaded value when given a function", async () => {
    const load = vi.fn(async () => ({ token: "issued", lifetimeMs: TTL_MS * 2 }));
    const cache = new ExpiringValueCache({ load, timeToLiveMs: (issued) => issued.lifetimeMs });

    await cache.get();
    vi.setSystemTime(TTL_MS * 2 - 1);
    await cache.get();
    expect(load).toHaveBeenCalledTimes(1);
    vi.setSystemTime(TTL_MS * 2);
    await cache.get();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one load between concurrent callers", async () => {
    let release: (value: string) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const cache = new ExpiringValueCache({ load, timeToLiveMs: TTL_MS });

    const callers = [cache.get(), cache.get(), cache.get()];
    release("shared");

    expect(await Promise.all(callers)).toEqual(["shared", "shared", "shared"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("rethrows a failed load by default and stores nothing", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("refused")).mockResolvedValueOnce("recovered");
    const cache = new ExpiringValueCache<string>({ load, timeToLiveMs: TTL_MS });

    await expect(cache.get()).rejects.toThrow("refused");
    expect(await cache.get()).toBe("recovered");
  });

  it("rethrows a failed load after expiry when keepStaleOnFailure is off", async () => {
    const load = vi.fn().mockResolvedValueOnce("first").mockRejectedValueOnce(new Error("refused"));
    const cache = new ExpiringValueCache<string>({ load, timeToLiveMs: TTL_MS });

    await cache.get();
    vi.setSystemTime(TTL_MS);
    await expect(cache.get()).rejects.toThrow("refused");
  });

  it("answers the stale value on failure with keepStaleOnFailure, and loads again next time", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce("first")
      .mockRejectedValueOnce(new Error("refused"))
      .mockResolvedValueOnce("second");
    const cache = new ExpiringValueCache<string>({ load, timeToLiveMs: TTL_MS, keepStaleOnFailure: true });

    await cache.get();
    vi.setSystemTime(TTL_MS);
    expect(await cache.get()).toBe("first");
    expect(await cache.get()).toBe("second");
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("rethrows with keepStaleOnFailure when there is no value to fall back on", async () => {
    const load = vi.fn().mockRejectedValue(new Error("refused"));
    const cache = new ExpiringValueCache<string>({ load, timeToLiveMs: TTL_MS, keepStaleOnFailure: true });

    await expect(cache.get()).rejects.toThrow("refused");
  });

  it("leaves no stale value to fall back on after invalidate", async () => {
    const load = vi.fn().mockResolvedValueOnce("first").mockRejectedValueOnce(new Error("refused"));
    const cache = new ExpiringValueCache<string>({ load, timeToLiveMs: TTL_MS, keepStaleOnFailure: true });

    await cache.get();
    cache.invalidate();
    await expect(cache.get()).rejects.toThrow("refused");
  });

  it("answers a value from set without loading", async () => {
    const load = countingLoader();
    const cache = new ExpiringValueCache({ load, timeToLiveMs: TTL_MS });

    cache.set("preset");
    expect(await cache.get()).toBe("preset");
    expect(load).not.toHaveBeenCalled();
  });

  it("loads again after reset", async () => {
    const load = countingLoader();
    const cache = new ExpiringValueCache({ load, timeToLiveMs: TTL_MS });

    await cache.get();
    cache.reset();
    expect(await cache.get()).toBe("value-2");
  });
});

describe("throwOnEmpty", () => {
  it("passes a value through", async () => {
    expect(await throwOnEmpty(async () => "token", "token")()).toBe("token");
  });

  it("throws in place of null or an empty string", async () => {
    await expect(throwOnEmpty(async () => null, "token")()).rejects.toThrow("token could not be loaded");
    await expect(throwOnEmpty(async () => "", "token")()).rejects.toThrow("token could not be loaded");
  });
});
