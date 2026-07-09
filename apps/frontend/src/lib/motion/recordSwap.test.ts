import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRecordSwapTimeline } from "@/lib/motion/recordSwap";

/** A minimal stand-in for the Web Animations `Animation` the factory drives. */
interface FakeAnimation {
  cancel: ReturnType<typeof vi.fn>;
  commitStyles: ReturnType<typeof vi.fn>;
  onfinish: (() => void) | null;
}

let animations: FakeAnimation[];
// biome-ignore lint/suspicious/noExplicitAny: swapping the prototype method for a spy
let originalAnimate: any;
let reducedMotion: boolean;

beforeEach(() => {
  animations = [];
  reducedMotion = false;
  // jsdom does not implement Element.animate; install a spy that records the
  // created animations so the factory's WAAPI usage is observable.
  // biome-ignore lint/suspicious/noExplicitAny: prototype patch for the test
  originalAnimate = (Element.prototype as any).animate;
  // biome-ignore lint/suspicious/noExplicitAny: prototype patch for the test
  (Element.prototype as any).animate = vi.fn(() => {
    const anim: FakeAnimation = { cancel: vi.fn(), commitStyles: vi.fn(), onfinish: null };
    animations.push(anim);
    return anim;
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reducedMotion,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: restore the prototype method
  (Element.prototype as any).animate = originalAnimate;
  vi.unstubAllGlobals();
});

function elements() {
  return { incoming: document.createElement("div"), outgoing: document.createElement("div") };
}

describe("buildRecordSwapTimeline", () => {
  it("returns null and starts no animation when reduced motion is preferred", () => {
    reducedMotion = true;
    const { incoming, outgoing } = elements();
    const handle = buildRecordSwapTimeline({ incoming, outgoing, onSettle: vi.fn() });
    expect(handle).toBeNull();
    expect(animations).toHaveLength(0);
  });

  it("animates both the incoming and the outgoing record and returns a cancel handle", () => {
    const { incoming, outgoing } = elements();
    const handle = buildRecordSwapTimeline({ incoming, outgoing, onSettle: vi.fn() });
    expect(handle).not.toBeNull();
    expect(animations).toHaveLength(2);
    expect(typeof handle?.cancel).toBe("function");
  });

  it("calls onSettle exactly once when the swap finishes naturally", () => {
    const onSettle = vi.fn();
    const { incoming, outgoing } = elements();
    buildRecordSwapTimeline({ incoming, outgoing, onSettle });
    const finishing = animations.find((a) => a.onfinish !== null);
    expect(finishing).toBeDefined();
    finishing?.onfinish?.();
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it("does not call onSettle when cancelled (an interrupting swap supersedes the settle)", () => {
    const onSettle = vi.fn();
    const { incoming, outgoing } = elements();
    const handle = buildRecordSwapTimeline({ incoming, outgoing, onSettle });
    handle?.cancel();
    for (const anim of animations) expect(anim.cancel).toHaveBeenCalled();
    const finishing = animations.find((a) => a.onfinish !== null);
    finishing?.onfinish?.();
    expect(onSettle).not.toHaveBeenCalled();
  });
});
