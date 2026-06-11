import { act, renderHook } from "@testing-library/react";
import gsap from "gsap";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFlipAnimation } from "./useFlipAnimation";

/**
 * jsdom has no layout engine (all rects are zero), so these tests cannot
 * assert visual flip output — `lib/motion/flip.test.ts` covers the utility's
 * tween contracts. Here we cover the hook's lifecycle contracts instead: the
 * `isReturning` flag must always release (animated, reduced-motion, and
 * no-snapshot paths), and no path may leave inline styles on the field.
 */

/**
 * Installs a `window.matchMedia` stub reporting the given reduced-motion
 * preference. jsdom does not implement `matchMedia`, so a plain stub (instead
 * of a spy on an existing method) is required.
 */
function stubPrefersReducedMotion(matches: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches } as MediaQueryList));
}

/** Creates a mounted field element and a ref pointing at it, as the consumer would. */
function buildFieldRef(): { el: HTMLDivElement; ref: RefObject<HTMLDivElement | null> } {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return { el, ref: { current: el } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("useFlipAnimation", () => {
  it("starts idle", () => {
    const { ref } = buildFieldRef();
    const { result } = renderHook(() => useFlipAnimation(ref));
    expect(result.current.isReturning).toBe(false);
  });

  it("releases the flag immediately when triggered without a captured snapshot", () => {
    stubPrefersReducedMotion(false);
    const { el, ref } = buildFieldRef();
    const { result } = renderHook(() => useFlipAnimation(ref));

    act(() => result.current.triggerReturn());

    expect(result.current.isReturning).toBe(false);
    expect(el.getAttribute("style")).toBeNull();
  });

  it("skips the tween and releases the flag under reduced motion, leaving no inline styles", () => {
    stubPrefersReducedMotion(true);
    const { el, ref } = buildFieldRef();
    const { result } = renderHook(() => useFlipAnimation(ref));

    act(() => result.current.capturePosition());
    act(() => result.current.triggerReturn());

    expect(result.current.isReturning).toBe(false);
    // The snapshot's transform normalization must be stripped again — an
    // empty (or absent) style attribute means no stale inline styles.
    expect(el.getAttribute("style") ?? "").toBe("");
  });

  it("runs the flip and releases the flag on completion when motion is allowed", async () => {
    stubPrefersReducedMotion(false);
    const { el, ref } = buildFieldRef();
    const { result } = renderHook(() => useFlipAnimation(ref));

    act(() => result.current.capturePosition());
    act(() => result.current.triggerReturn());

    // The flip timeline is in flight (zero layout delta in jsdom, but the
    // timeline still has to render once before completing).
    expect(result.current.isReturning).toBe(true);

    await vi.waitFor(() => {
      act(() => {
        gsap.ticker.tick();
      });
      expect(result.current.isReturning).toBe(false);
    });

    // useGSAP's context revert must strip everything GSAP wrote inline.
    expect(el.getAttribute("style") ?? "").toBe("");
  });

  it("re-arms cleanly when capture + trigger fire again before the flip released", async () => {
    stubPrefersReducedMotion(false);
    const { el, ref } = buildFieldRef();
    const { result } = renderHook(() => useFlipAnimation(ref));

    act(() => {
      result.current.capturePosition();
      result.current.triggerReturn();
    });
    // Second arming while the first flip has not completed yet: capturing
    // force-completes the in-flight flip; the tick-keyed effect must still
    // consume the fresh snapshot and release the flag afterwards.
    act(() => {
      result.current.capturePosition();
      result.current.triggerReturn();
    });
    expect(result.current.isReturning).toBe(true);

    await vi.waitFor(() => {
      act(() => {
        gsap.ticker.tick();
      });
      expect(result.current.isReturning).toBe(false);
    });
    expect(el.getAttribute("style") ?? "").toBe("");
  });
});
