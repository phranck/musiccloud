import { act, renderHook } from "@testing-library/react";
import gsap from "gsap";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrackListView } from "@/hooks/useTrackListView";
import { useTrackViewMorph } from "./useTrackViewMorph";

/**
 * jsdom has no layout engine (all rects are zero), so these tests pin the hook's
 * wiring/lifecycle rather than visual flip output (`lib/motion/flip.test.ts`
 * covers the tween contracts): `setView` snapshots before the commit and
 * animates after it, and `outgoingView` always releases — on the animated path
 * (after a ticker tick) and instantly under reduced motion.
 */

/** Stubs `window.matchMedia` to report the given reduced-motion preference. */
function stubPrefersReducedMotion(matches: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches } as MediaQueryList));
}

/** Builds a container with two flip-id covers and wires it to the hook's ref. */
function attachContainer(ref: RefObject<HTMLDivElement | null>): void {
  const container = document.createElement("div");
  for (const id of ["a:1", "b:2"]) {
    const cover = document.createElement("div");
    cover.setAttribute("data-flip-id", id);
    container.appendChild(cover);
  }
  document.body.appendChild(container);
  ref.current = container;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("useTrackViewMorph", () => {
  it("starts on the list view with no morph in flight", () => {
    const { result } = renderHook(() => useTrackViewMorph("mc:test:start"));
    expect(result.current.view).toBe(TrackListView.List);
    expect(result.current.outgoingView).toBeNull();
  });

  it("switches the view and marks the previous one outgoing during the morph", async () => {
    stubPrefersReducedMotion(false);
    const { result } = renderHook(() => useTrackViewMorph("mc:test:switch"));
    attachContainer(result.current.containerRef);

    act(() => result.current.setView(TrackListView.Grid));

    expect(result.current.view).toBe(TrackListView.Grid);
    expect(result.current.outgoingView).toBe(TrackListView.List);

    await vi.waitFor(() => {
      act(() => {
        gsap.ticker.tick();
      });
      expect(result.current.outgoingView).toBeNull();
    });
  });

  it("switches instantly under reduced motion, leaving no outgoing view", () => {
    stubPrefersReducedMotion(true);
    const { result } = renderHook(() => useTrackViewMorph("mc:test:reduced"));
    attachContainer(result.current.containerRef);

    act(() => result.current.setView(TrackListView.Grid));

    expect(result.current.view).toBe(TrackListView.Grid);
    expect(result.current.outgoingView).toBeNull();
  });

  it("ignores a switch to the already-active view", () => {
    const { result } = renderHook(() => useTrackViewMorph("mc:test:noop"));
    attachContainer(result.current.containerRef);

    act(() => result.current.setView(TrackListView.List));

    expect(result.current.view).toBe(TrackListView.List);
    expect(result.current.outgoingView).toBeNull();
  });
});
