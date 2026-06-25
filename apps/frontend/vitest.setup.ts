import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";
import * as matchers from "@testing-library/jest-dom/matchers";
import { expect } from "vitest";

/**
 * jsdom does not implement `AnimationEvent`. React DOM feature-detects it at
 * import time (`'AnimationEvent' in window`) and, when absent, registers its
 * animation listeners under the WebKit-prefixed event names — so React
 * `onAnimationEnd` handlers never receive the standard `animationend` that
 * `fireEvent.animationEnd` dispatches. Installing the constructor BEFORE any
 * test file imports React keeps React on the standard event names and makes
 * CSS-animation handlers testable.
 */
class AnimationEventPolyfill extends Event {
  readonly animationName: string;
  readonly elapsedTime: number;
  readonly pseudoElement: string;

  constructor(type: string, init: AnimationEventInit = {}) {
    super(type, init);
    this.animationName = init.animationName ?? "";
    this.elapsedTime = init.elapsedTime ?? 0;
    this.pseudoElement = init.pseudoElement ?? "";
  }
}

if (!("AnimationEvent" in globalThis)) {
  (globalThis as Record<string, unknown>).AnimationEvent = AnimationEventPolyfill;
}

/**
 * jsdom does not implement `ResizeObserver`. `useGroupedCorners` constructs one
 * on mount, so any test that renders a grouped-corner list (the artist track
 * list/grid) would throw `ResizeObserver is not defined`. A no-op stub suffices —
 * these tests assert wiring/DOM, not live reflow (which jsdom has no layout for).
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!("ResizeObserver" in globalThis)) {
  (globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
}

// jest-dom's own `@testing-library/jest-dom/vitest` entry is broken twice
// under this stack, so both halves are wired manually here:
//
// Runtime: that entry imports `expect` from "vitest" via plain Node
// resolution, which under pnpm resolves to the package's CJS build — a SECOND
// expect instance, so the matchers never reach the running test context
// ("Invalid Chai property: toBeInTheDocument"). Extending explicitly from
// this setup module (processed by the live runner) targets the correct
// instance.
expect.extend(matchers);

// Types: the entry augments `Assertion` in module "vitest", but vitest 4 only
// RE-exports that interface from `@vitest/expect`, so the augmentation never
// merges. Vitest ≥ 3.2 designates the `Matchers` interface as the extension
// point; mirroring jest-dom's own augmentation onto it makes the matchers
// type-check (this file is part of the project's TS program, so the
// augmentation applies to all test files).
declare module "vitest" {
  // Declaration merging requires the exact type parameters of the original
  // `Matchers<T = any>` in @vitest/expect — `unknown` would be a TS2428.
  // biome-ignore lint/suspicious/noExplicitAny: see above
  interface Matchers<T = any> extends TestingLibraryMatchers<unknown, T> {}
}
