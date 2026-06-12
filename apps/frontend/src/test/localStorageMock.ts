import { vi } from "vitest";

/**
 * In-memory `Storage` stand-in for unit tests.
 *
 * jsdom 29 under this Vitest setup exposes no working `localStorage`
 * (accessing it yields `undefined`), so every suite that touches
 * persistence stubs the global with this Map-backed mock:
 * `vi.stubGlobal("localStorage", createLocalStorageMock())` — and restores
 * it via `vi.unstubAllGlobals()` in `afterEach`.
 *
 * Each method is a `vi.fn`, so tests can assert reads and writes directly.
 * A fresh mock per test (created in `beforeEach`) doubles as the cleanup:
 * the backing Map starts empty, no `clear()` choreography needed.
 *
 * @returns A spec-shaped `Storage` object backed by a private Map.
 */
export function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => store.delete(key)),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  };
}
