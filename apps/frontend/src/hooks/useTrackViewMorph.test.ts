import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrackListView } from "@/hooks/useTrackListView";
import { useTrackViewMorph } from "./useTrackViewMorph";

/**
 * jsdom has no layout engine, so these tests pin the hook's wiring (the visual
 * flip is browser-verified): `setView` captures before the commit and runs the
 * flip after it with `absolute: false`, switching to the current view is a
 * no-op, and reduced motion switches instantly without arming a flip. The flip
 * utility is mocked so the assertions don't depend on real GSAP output.
 */

const flipMocks = vi.hoisted(() => ({
  captureFlipState: vi.fn((_targets: unknown) => ({}) as object),
  animateFlipFrom: vi.fn((_state: unknown, _options: unknown) => null),
}));

vi.mock("@/lib/motion/flip", () => ({
  captureFlipState: flipMocks.captureFlipState,
  animateFlipFrom: flipMocks.animateFlipFrom,
}));

/** Stubs `window.matchMedia` to report the given reduced-motion preference. */
function stubPrefersReducedMotion(matches: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches } as MediaQueryList));
}

/** Builds a container with one flip-id cover and wires it to the hook's ref. */
function attachContainer(ref: RefObject<HTMLDivElement | null>): void {
  const container = document.createElement("div");
  const cover = document.createElement("div");
  cover.setAttribute("data-flip-id", "a:1");
  container.appendChild(cover);
  document.body.appendChild(container);
  ref.current = container;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe("useTrackViewMorph", () => {
  it("starts on the list view", () => {
    const { result } = renderHook(() => useTrackViewMorph("mc:test:start"));
    expect(result.current.view).toBe(TrackListView.List);
  });

  it("captures before the commit and runs the flip (absolute:false) after switching", () => {
    stubPrefersReducedMotion(false);
    const { result } = renderHook(() => useTrackViewMorph("mc:test:switch"));
    attachContainer(result.current.containerRef);

    act(() => result.current.setView(TrackListView.Grid));

    expect(result.current.view).toBe(TrackListView.Grid);
    expect(flipMocks.captureFlipState).toHaveBeenCalledTimes(1);
    expect(flipMocks.animateFlipFrom).toHaveBeenCalledTimes(1);
    expect(flipMocks.animateFlipFrom.mock.calls[0]?.[1]).toMatchObject({ absolute: false });
  });

  it("switches instantly under reduced motion without arming a flip", () => {
    stubPrefersReducedMotion(true);
    const { result } = renderHook(() => useTrackViewMorph("mc:test:reduced"));
    attachContainer(result.current.containerRef);

    act(() => result.current.setView(TrackListView.Grid));

    expect(result.current.view).toBe(TrackListView.Grid);
    expect(flipMocks.captureFlipState).not.toHaveBeenCalled();
    expect(flipMocks.animateFlipFrom).not.toHaveBeenCalled();
  });

  it("ignores a switch to the already-active view", () => {
    const { result } = renderHook(() => useTrackViewMorph("mc:test:noop"));
    attachContainer(result.current.containerRef);

    act(() => result.current.setView(TrackListView.List));

    expect(result.current.view).toBe(TrackListView.List);
    expect(flipMocks.captureFlipState).not.toHaveBeenCalled();
  });
});
