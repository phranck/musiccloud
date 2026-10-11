import "@testing-library/jest-dom/vitest";

/**
 * jsdom implements no `ResizeObserver`, and any component that measures itself
 * throws on mount without one. The stub observes nothing and reports nothing,
 * which is correct here: a layout that never changes size has no resize to
 * report, and a test that needs measured geometry belongs in a browser.
 */
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}
