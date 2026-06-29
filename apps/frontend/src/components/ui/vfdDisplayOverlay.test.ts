import { describe, expect, it } from "vitest";
import {
  VfdBrightness,
  type VfdCanvasPixelColumn,
  type VfdCanvasRenderState,
  VfdScrollOutDirection,
} from "@/components/ui/VfdDisplayTypes";
import {
  easeOutCubic,
  mergeOverlayColumns,
  overlayProgress,
  scrollOutStartColumn,
  syncOverlayState,
} from "@/components/ui/vfdDisplayOverlay";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal VfdCanvasRenderState for overlay tests. */
function makeState(): VfdCanvasRenderState {
  return {
    lines: [],
    transitions: new Map(),
    marqueeStates: new Map(),
    overlays: new Map(),
    cellCount: 44,
    rowCount: 4,
    prefersReducedMotion: false,
  };
}

/** Builds a lit pixel column (mask has at least one row set). */
function litColumn(): VfdCanvasPixelColumn {
  return { mask: 0b1111111, brightness: VfdBrightness.Bright };
}

/** Builds a blank (unlit) pixel column. */
function blankColumn(): VfdCanvasPixelColumn {
  return { mask: 0, brightness: VfdBrightness.Bright };
}

/** Builds an overlay pixel column distinct from a blank foreground column. */
function overlayColumn(): VfdCanvasPixelColumn {
  return { mask: 0b0001000, brightness: VfdBrightness.Normal };
}

// ---------------------------------------------------------------------------
// easeOutCubic
// ---------------------------------------------------------------------------

describe("easeOutCubic", () => {
  it("maps 0→0 and 1→1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });
  it("clamps values below 0 to 0", () => {
    expect(easeOutCubic(-1)).toBe(0);
  });
  it("clamps values above 1 to 1", () => {
    expect(easeOutCubic(2)).toBe(1);
  });
  it("is monotonically increasing between 0 and 1", () => {
    const samples = [0, 0.25, 0.5, 0.75, 1];
    for (let i = 1; i < samples.length; i += 1) {
      expect(easeOutCubic(samples[i])).toBeGreaterThan(easeOutCubic(samples[i - 1]));
    }
  });
});

// ---------------------------------------------------------------------------
// scrollOutStartColumn
// ---------------------------------------------------------------------------

describe("scrollOutStartColumn", () => {
  const rowCols = 100;
  const overlayCols = 20;
  it("starts centered at progress 0", () => {
    expect(scrollOutStartColumn(VfdScrollOutDirection.Left, 0, rowCols, overlayCols)).toBe(40);
    expect(scrollOutStartColumn(VfdScrollOutDirection.Right, 0, rowCols, overlayCols)).toBe(40);
  });
  it("exits left past column 0 at progress 1", () => {
    expect(scrollOutStartColumn(VfdScrollOutDirection.Left, 1, rowCols, overlayCols)).toBe(-20);
  });
  it("exits right past the row width at progress 1", () => {
    expect(scrollOutStartColumn(VfdScrollOutDirection.Right, 1, rowCols, overlayCols)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// syncOverlayState
// ---------------------------------------------------------------------------

describe("syncOverlayState", () => {
  it("arms a new overlay entry when none exists", () => {
    const state = makeState();
    syncOverlayState(
      state,
      { scrollOutOverlay: { text: "<< 10s", direction: VfdScrollOutDirection.Left, durationMs: 2900, nonce: 1 } },
      0,
      1000,
    );
    const entry = state.overlays.get(0);
    expect(entry).toBeDefined();
    expect(entry?.text).toBe("<< 10s");
    expect(entry?.startedAt).toBe(1000);
    expect(entry?.nonce).toBe(1);
  });

  it("does not re-arm when the nonce is unchanged", () => {
    const state = makeState();
    const overlay = { text: "<< 10s", direction: VfdScrollOutDirection.Left, durationMs: 2900, nonce: 1 };
    syncOverlayState(state, { scrollOutOverlay: overlay }, 0, 1000);
    syncOverlayState(state, { scrollOutOverlay: overlay }, 0, 2000);
    expect(state.overlays.get(0)?.startedAt).toBe(1000); // unchanged
  });

  it("re-arms from the new timestamp when the nonce changes", () => {
    const state = makeState();
    syncOverlayState(
      state,
      { scrollOutOverlay: { text: "<< 10s", direction: VfdScrollOutDirection.Left, durationMs: 2900, nonce: 1 } },
      0,
      1000,
    );
    syncOverlayState(
      state,
      { scrollOutOverlay: { text: "10s >>", direction: VfdScrollOutDirection.Right, durationMs: 2900, nonce: 2 } },
      0,
      2000,
    );
    const entry = state.overlays.get(0);
    expect(entry?.startedAt).toBe(2000);
    expect(entry?.nonce).toBe(2);
  });

  it("removes the entry when the line has no overlay", () => {
    const state = makeState();
    syncOverlayState(
      state,
      { scrollOutOverlay: { text: "<< 10s", direction: VfdScrollOutDirection.Left, durationMs: 2900, nonce: 1 } },
      0,
      1000,
    );
    syncOverlayState(state, { scrollOutOverlay: undefined }, 0, 2000);
    expect(state.overlays.has(0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mergeOverlayColumns
// ---------------------------------------------------------------------------

describe("mergeOverlayColumns", () => {
  it("returns foreground lit pixels unchanged", () => {
    const fg = [litColumn(), blankColumn()];
    const ov = [overlayColumn(), overlayColumn()];
    const merged = mergeOverlayColumns(fg, ov, 0, 1);
    expect(merged[0]).toBe(fg[0]); // lit fg wins
  });

  it("shows overlay outside the foreground text span", () => {
    // Row: [blank, lit, lit, blank]  textFirst=1 textLast=2
    const fg = [blankColumn(), litColumn(), litColumn(), blankColumn()];
    const ov = [overlayColumn(), overlayColumn(), overlayColumn(), overlayColumn()];
    const merged = mergeOverlayColumns(fg, ov, 1, 2);
    expect(merged[0]).toBe(ov[0]); // outside span → overlay shows
    expect(merged[3]).toBe(ov[3]); // outside span → overlay shows
  });

  it("keeps blank gaps inside the text span (occlusion)", () => {
    // Row: [lit, blank, lit]  textFirst=0 textLast=2
    // The blank at index 1 is inside the span → stays blank
    const fg = [litColumn(), blankColumn(), litColumn()];
    const ov = [overlayColumn(), overlayColumn(), overlayColumn()];
    const merged = mergeOverlayColumns(fg, ov, 0, 2);
    expect(merged[1]).toBe(fg[1]); // inside span → foreground blank wins
  });
});

// ---------------------------------------------------------------------------
// overlayProgress
// ---------------------------------------------------------------------------

describe("overlayProgress", () => {
  const baseOverlay = {
    text: "<< 10s",
    direction: VfdScrollOutDirection.Left as VfdScrollOutDirection,
    durationMs: 1000,
    nonce: 1,
    startedAt: 0,
  };

  it("returns 0 at startedAt", () => {
    expect(overlayProgress(baseOverlay, 0)).toBe(0);
  });
  it("returns 0.5 at half duration", () => {
    expect(overlayProgress(baseOverlay, 500)).toBe(0.5);
  });
  it("returns 1 at full duration", () => {
    expect(overlayProgress(baseOverlay, 1000)).toBe(1);
  });
  it("clamps to 1 past full duration", () => {
    expect(overlayProgress(baseOverlay, 2000)).toBe(1);
  });
  it("clamps to 0 before startedAt", () => {
    expect(overlayProgress(baseOverlay, -100)).toBe(0);
  });
});
