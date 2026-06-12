import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initPageTransitions, PAGE_CONTENT_SELECTOR } from "./pageTransitions";

/**
 * Lifecycle-wiring contract of the GSAP page transitions (plan MC-029 Task
 * 3.1). jsdom has no layout engine and no real ClientRouter, so the tests
 * drive the wiring directly: synthetic `astro:before-preparation` events
 * carrying a `loader` (the property Astro exposes for exactly this wrapping
 * pattern) and `astro:after-swap` events after replacing the page content.
 *
 * Pinned contracts:
 * - The out animation runs through the wrapped loader and the ORIGINAL
 *   loader still executes (navigation must never be swallowed).
 * - A killed/interrupted out animation must not deadlock the loader (GSAP
 *   timelines never settle their `then()` after `kill()` — the module must
 *   resolve via `onInterrupt` as well).
 * - The in animation plays on the freshly swapped content and clears its
 *   inline styles when it completes (no transform residue: an animating
 *   ancestor with a transform would become the containing block for fixed
 *   overlays inside the page).
 * - Reduced motion skips both tweens entirely (instant swap).
 */

/** Mirrors Astro's BeforePreparationEvent surface that the module consumes. */
interface PreparationEventLike extends Event {
  loader: () => Promise<void>;
}

function dispatchBeforePreparation(loader: () => Promise<void>): PreparationEventLike {
  const event = new Event("astro:before-preparation") as PreparationEventLike;
  event.loader = loader;
  document.dispatchEvent(event);
  return event;
}

function dispatchAfterSwap(): void {
  document.dispatchEvent(new Event("astro:after-swap"));
}

function mountPageContent(): HTMLElement {
  const page = document.createElement("div");
  page.setAttribute("data-mc-page", "");
  document.body.appendChild(page);
  return page;
}

/** Completes every in-flight GSAP animation deterministically (no ticker time). */
function settleAllAnimations(): void {
  gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.totalProgress(1));
}

function stubPrefersReducedMotion(matches: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches } as MediaQueryList));
}

beforeEach(() => {
  stubPrefersReducedMotion(false);
});

afterEach(() => {
  gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.kill());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("page transition lifecycle", () => {
  it("registers its listeners only once across repeated init calls", async () => {
    const addListener = vi.spyOn(document, "addEventListener");
    initPageTransitions();
    initPageTransitions();
    const registered = addListener.mock.calls.filter(([type]) => String(type).startsWith("astro:"));
    expect(registered.length).toBeLessThanOrEqual(2);
  });

  it("plays the out tween through the wrapped loader and still runs the original loader", async () => {
    initPageTransitions();
    const page = mountPageContent();
    const originalLoader = vi.fn().mockResolvedValue(undefined);

    const event = dispatchBeforePreparation(originalLoader);
    expect(event.loader).not.toBe(originalLoader);

    const loaderDone = event.loader();
    expect(gsap.getTweensOf(page).length).toBeGreaterThan(0);

    settleAllAnimations();
    await loaderDone;
    expect(originalLoader).toHaveBeenCalledTimes(1);
  });

  it("does not deadlock the loader when the out tween is killed mid-flight (interrupt)", async () => {
    initPageTransitions();
    const page = mountPageContent();
    const event = dispatchBeforePreparation(vi.fn().mockResolvedValue(undefined));

    const loaderDone = event.loader();
    gsap.getTweensOf(page).forEach((tween) => tween.kill());

    await expect(loaderDone).resolves.toBeUndefined();
  });

  it("plays the in tween on the swapped content and ends without inline residue", () => {
    initPageTransitions();
    document.body.replaceChildren();
    const fresh = mountPageContent();

    dispatchAfterSwap();
    expect(gsap.getTweensOf(fresh).length).toBeGreaterThan(0);

    settleAllAnimations();
    expect(fresh.style.transform).toBe("");
    expect(fresh.style.opacity).toBe("");
  });

  it("skips both tweens under reduced motion (instant swap)", async () => {
    stubPrefersReducedMotion(true);
    initPageTransitions();
    const page = mountPageContent();
    const originalLoader = vi.fn().mockResolvedValue(undefined);

    const event = dispatchBeforePreparation(originalLoader);
    await event.loader();
    expect(originalLoader).toHaveBeenCalledTimes(1);
    expect(gsap.getTweensOf(page)).toHaveLength(0);

    dispatchAfterSwap();
    expect(gsap.getTweensOf(page)).toHaveLength(0);
  });
});

describe("PAGE_CONTENT_SELECTOR", () => {
  it("matches the BaseLayout page wrapper marker", () => {
    const page = mountPageContent();
    expect(document.querySelector(PAGE_CONTENT_SELECTOR)).toBe(page);
  });
});
