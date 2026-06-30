import { describe, expect, it } from "vitest";
import type { VfdMarqueeRuntimeState } from "@/components/ui/VfdDisplayTypes";
import { VfdMarqueeMode } from "@/components/ui/VfdDisplayTypes";
import { pruneUntouchedMarqueeStates, shouldMarquee } from "@/components/ui/vfdDisplayMarquee";

/** Minimal valid marquee runtime state for map-pruning assertions. */
function makeRuntimeState(offset = 0): VfdMarqueeRuntimeState {
  return { offset, direction: 1, holdSteps: 0, elapsedMs: 0, previousFrameTime: 0 };
}

describe("shouldMarquee", () => {
  it("never scrolls when marquee is disabled, regardless of overflow", () => {
    expect(shouldMarquee("A VERY LONG TITLE", false, 4)).toBe(false);
    expect(shouldMarquee("A VERY LONG TITLE", undefined, 4)).toBe(false);
  });

  it('scrolls only on overflow for both the `true` and `"overflow"` modes', () => {
    expect(shouldMarquee("A VERY LONG TITLE", true, 4)).toBe(true);
    expect(shouldMarquee("A VERY LONG TITLE", VfdMarqueeMode.Overflow, 4)).toBe(true);
    // Fits within the visible cells → no scroll in either mode.
    expect(shouldMarquee("HI", true, 4)).toBe(false);
    expect(shouldMarquee("HI", VfdMarqueeMode.Overflow, 4)).toBe(false);
  });
});

describe("pruneUntouchedMarqueeStates", () => {
  it("drops keys not referenced this frame so past-track entries cannot accumulate", () => {
    const states = new Map<string, VfdMarqueeRuntimeState>([
      ["row:0:OLD TRACK TITLE", makeRuntimeState(3)],
      ["row:0:NEW TRACK TITLE", makeRuntimeState(0)],
      ["row:3:OLD STATUS", makeRuntimeState(1)],
    ]);

    pruneUntouchedMarqueeStates(states, new Set(["row:0:NEW TRACK TITLE"]));

    expect([...states.keys()]).toEqual(["row:0:NEW TRACK TITLE"]);
  });

  it("keeps every key while it is still being touched", () => {
    const states = new Map<string, VfdMarqueeRuntimeState>([
      ["a", makeRuntimeState()],
      ["b", makeRuntimeState()],
    ]);

    pruneUntouchedMarqueeStates(states, new Set(["a", "b"]));

    expect(states.size).toBe(2);
  });

  it("empties the map when nothing was touched (content stopped overflowing)", () => {
    const states = new Map<string, VfdMarqueeRuntimeState>([["a", makeRuntimeState()]]);

    pruneUntouchedMarqueeStates(states, new Set());

    expect(states.size).toBe(0);
  });
});
