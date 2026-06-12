import { render } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VfdDisplay } from "@/components/ui/VfdDisplay";
import { VfdBrightness } from "@/components/ui/VfdDisplayTypes";

/**
 * Frame-loop contract of VfdDisplay (plan MC-029 Task 5.3a). The canvas
 * draw loop runs on the SHARED `gsap.ticker` (policy 3 — no private
 * `requestAnimationFrame` source) and only while something is animating
 * (marquee/line-swap), registering on demand and removing itself the moment
 * a frame reports no active animation. The phosphor colors are resolved
 * OUTSIDE the per-frame path (the previous per-frame `resolveCanvasColors`
 * appended four probe spans to the DOM every frame — the documented
 * ~60-layouts/s marquee stream). jsdom has no real canvas, so the canvas
 * draw + color resolution are mocked; the wiring is what this pins.
 */

const drawResult = vi.hoisted(() => ({ hasActiveAnimation: false }));

vi.mock("@/components/ui/vfdDisplayCanvas", () => ({
  drawVfdCanvas: vi.fn(() => drawResult.hasActiveAnimation),
}));

vi.mock("@/components/ui/vfdDisplayColors", () => ({
  resolveCanvasColors: vi.fn(() => ({
    [VfdBrightness.Bright]: "#fff",
    [VfdBrightness.Normal]: "#ccc",
    [VfdBrightness.Dim]: "#888",
    [VfdBrightness.Ghost]: "#222",
  })),
}));

import { drawVfdCanvas } from "@/components/ui/vfdDisplayCanvas";
import { resolveCanvasColors } from "@/components/ui/vfdDisplayColors";

let tickerAdd: ReturnType<typeof vi.spyOn>;
let tickerRemove: ReturnType<typeof vi.spyOn>;
let rafSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  drawResult.hasActiveAnimation = false;
  vi.mocked(drawVfdCanvas).mockClear();
  vi.mocked(resolveCanvasColors).mockClear();
  // No-op the real ticker so it never invokes the captured callback on its
  // own rAF — every tick in these tests is driven manually for determinism.
  // add returns the callback it was given; remove returns the ticker.
  tickerAdd = vi.spyOn(gsap.ticker, "add").mockImplementation((callback) => callback);
  tickerRemove = vi.spyOn(gsap.ticker, "remove").mockImplementation(() => gsap.ticker);
  rafSpy = vi.spyOn(window, "requestAnimationFrame");
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList),
  );
});

afterEach(() => {
  tickerAdd.mockRestore();
  tickerRemove.mockRestore();
  rafSpy.mockRestore();
  vi.unstubAllGlobals();
});

/** Pulls the most recently registered ticker callback out of the add spy. */
function lastTick(): (time: number) => void {
  const call = tickerAdd.mock.calls.at(-1);
  if (!call) throw new Error("no gsap.ticker.add call captured");
  return call[0] as (time: number) => void;
}

describe("VfdDisplay frame loop", () => {
  it("drives the canvas off gsap.ticker, not a private requestAnimationFrame", () => {
    render(<VfdDisplay lines={[{ content: "HELLO" }]} rows={1} charsPerLine={8} />);
    expect(tickerAdd).toHaveBeenCalled();
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it("resolves phosphor colors off the per-frame path (no probe-span layout stream)", () => {
    drawResult.hasActiveAnimation = true; // keep the loop alive across ticks
    render(<VfdDisplay lines={[{ content: "SCROLLING TITLE", marquee: true }]} rows={1} charsPerLine={4} />);
    const tick = lastTick();
    const resolvedAfterMount = vi.mocked(resolveCanvasColors).mock.calls.length;

    tick(16);
    tick(32);
    tick(48);
    // drawVfdCanvas runs every tick, but the colors must NOT be re-resolved
    // each frame — that is the DOM-probe layout stream we are killing.
    expect(vi.mocked(drawVfdCanvas).mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(vi.mocked(resolveCanvasColors).mock.calls.length).toBe(resolvedAfterMount);
    // The cached colors still reach the canvas.
    const colorsArg = vi.mocked(drawVfdCanvas).mock.calls.at(-1)?.[2];
    expect(colorsArg).toMatchObject({ [VfdBrightness.Bright]: "#fff" });
  });

  it("removes its ticker callback once a frame reports no active animation", () => {
    drawResult.hasActiveAnimation = true;
    render(<VfdDisplay lines={[{ content: "ABC", marquee: true }]} rows={1} charsPerLine={2} />);
    const tick = lastTick();
    tick(16); // still animating → stays registered
    expect(tickerRemove).not.toHaveBeenCalledWith(tick);

    drawResult.hasActiveAnimation = false;
    tick(32); // animation ended → self-deregister
    expect(tickerRemove).toHaveBeenCalledWith(tick);
  });

  it("removes its ticker callback on unmount", () => {
    drawResult.hasActiveAnimation = true;
    const { unmount } = render(<VfdDisplay lines={[{ content: "X", marquee: true }]} rows={1} charsPerLine={2} />);
    const tick = lastTick();
    unmount();
    expect(tickerRemove).toHaveBeenCalledWith(tick);
  });
});
