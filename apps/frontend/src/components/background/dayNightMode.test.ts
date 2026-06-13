import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalStorageMock } from "@/test/localStorageMock";

/**
 * Contract of the day-night mode store (plan MC-030 Task 2): a module-level
 * store shared between the header island (writer) and the background island
 * (reader) via the common ES-module graph — the same pattern analyzerMode.ts
 * uses across player islands. Module state survives imports, so every test
 * gets a FRESH module instance via vi.resetModules + dynamic import; storage
 * is the project's Map-backed mock (jsdom 29 exposes no localStorage).
 */

const STORAGE_KEY = "mc.background.dayNightMode";

async function freshStore() {
  vi.resetModules();
  return await import("@/components/background/dayNightMode");
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dayNightMode store", () => {
  it("defaults to Night without a stored choice", async () => {
    const { getDayNightMode, DayNightMode } = await freshStore();
    expect(getDayNightMode()).toBe(DayNightMode.Night);
  });

  it("persists the chosen mode and reads it back after a reload", async () => {
    const store = await freshStore();
    store.setDayNightMode(store.DayNightMode.Day);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(store.DayNightMode.Day);

    const reloaded = await freshStore(); // fresh module = page reload
    expect(reloaded.getDayNightMode()).toBe(reloaded.DayNightMode.Day);
  });

  it("falls back to Night on an invalid stored value", async () => {
    localStorage.setItem(STORAGE_KEY, "purple");
    const { getDayNightMode, DayNightMode } = await freshStore();
    expect(getDayNightMode()).toBe(DayNightMode.Night);
  });

  it("notifies subscribers on change and stops after unsubscribe", async () => {
    const store = await freshStore();
    const subscriber = vi.fn();
    const unsubscribe = store.subscribeDayNightMode(subscriber);

    store.setDayNightMode(store.DayNightMode.System);
    expect(subscriber).toHaveBeenCalledExactlyOnceWith(store.DayNightMode.System);

    unsubscribe();
    store.setDayNightMode(store.DayNightMode.Day);
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  it("ignores setting the already-active mode", async () => {
    const store = await freshStore();
    const subscriber = vi.fn();
    store.subscribeDayNightMode(subscriber);

    store.setDayNightMode(store.DayNightMode.Night); // Night is the default
    expect(subscriber).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
