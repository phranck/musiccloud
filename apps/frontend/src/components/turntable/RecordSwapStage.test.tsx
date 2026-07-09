import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordSwapStage } from "@/components/turntable/RecordSwapStage";
import { VinylSpinState } from "@/components/vinyl/VinylRecord.types";
import { buildRecordSwapTimeline } from "@/lib/motion/recordSwap";
import { prefersReducedMotion } from "@/lib/motion/setup";

vi.mock("@/lib/motion/recordSwap");
// Keep the real setup module (its side-effect GSAP registration is harmless in
// jsdom) but make the reduced-motion read a controllable spy for the instant path.
vi.mock("@/lib/motion/setup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/motion/setup")>();
  return { ...actual, prefersReducedMotion: vi.fn(() => false) };
});

const mockBuild = vi.mocked(buildRecordSwapTimeline);
const mockReducedMotion = vi.mocked(prefersReducedMotion);

interface Built {
  onSettle: () => void;
  cancel: ReturnType<typeof vi.fn>;
}
let built: Built[];

beforeEach(() => {
  built = [];
  mockReducedMotion.mockReturnValue(false);
  mockBuild.mockImplementation((options) => {
    const cancel = vi.fn();
    built.push({ onSettle: options.onSettle, cancel });
    return { cancel };
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Every {@link VinylRecord} renders a `<figure data-spin-state>`; count them. */
function vinylCount(container: HTMLElement): number {
  return container.querySelectorAll("figure[data-spin-state]").length;
}

describe("RecordSwapStage", () => {
  it("renders a single record and starts no swap initially", () => {
    const { container } = render(
      <RecordSwapStage record={{ labelTitle: "A" }} spinState={VinylSpinState.Idle} swapKey="a" />,
    );
    expect(vinylCount(container)).toBe(1);
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it("waits for the spin to reach idle before sliding when the deck is still playing", () => {
    const { container, rerender } = render(
      <RecordSwapStage record={{ labelTitle: "A" }} spinState={VinylSpinState.Playing} swapKey="a" />,
    );

    // A swapKey change while playing must NOT slide yet: the old record stays on
    // the platter and coasts down first (still exactly one disc, no timeline).
    act(() => {
      rerender(<RecordSwapStage record={{ labelTitle: "B" }} spinState={VinylSpinState.Playing} swapKey="b" />);
    });
    expect(vinylCount(container)).toBe(1);
    expect(mockBuild).not.toHaveBeenCalled();

    // Still coasting: still no slide.
    act(() => {
      rerender(<RecordSwapStage record={{ labelTitle: "B" }} spinState={VinylSpinState.Coasting} swapKey="b" />);
    });
    expect(mockBuild).not.toHaveBeenCalled();

    // The spin reaches idle (coast finished): now both records mount and slide.
    act(() => {
      rerender(<RecordSwapStage record={{ labelTitle: "B" }} spinState={VinylSpinState.Idle} swapKey="b" />);
    });
    expect(vinylCount(container)).toBe(2);
    expect(mockBuild).toHaveBeenCalledTimes(1);
  });

  it("slides immediately when the deck is already idle at swap time, then unmounts the outgoing on settle", () => {
    const { container, rerender } = render(
      <RecordSwapStage record={{ labelTitle: "A" }} spinState={VinylSpinState.Idle} swapKey="a" />,
    );
    act(() => {
      rerender(<RecordSwapStage record={{ labelTitle: "B" }} spinState={VinylSpinState.Idle} swapKey="b" />);
    });
    expect(vinylCount(container)).toBe(2);
    expect(mockBuild).toHaveBeenCalledTimes(1);

    act(() => {
      built[0].onSettle();
    });
    expect(vinylCount(container)).toBe(1);
  });

  it("fires onSettled once the slide settles", () => {
    const onSettled = vi.fn();
    const { rerender } = render(
      <RecordSwapStage
        record={{ labelTitle: "A" }}
        spinState={VinylSpinState.Idle}
        swapKey="a"
        onSettled={onSettled}
      />,
    );
    act(() => {
      rerender(
        <RecordSwapStage
          record={{ labelTitle: "B" }}
          spinState={VinylSpinState.Idle}
          swapKey="b"
          onSettled={onSettled}
        />,
      );
    });
    expect(onSettled).not.toHaveBeenCalled();

    act(() => {
      built[0].onSettle();
    });
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("cancels the in-flight swap and starts a new one on an overlapping swapKey change", () => {
    const { rerender } = render(
      <RecordSwapStage record={{ labelTitle: "A" }} spinState={VinylSpinState.Idle} swapKey="a" />,
    );
    act(() => {
      rerender(<RecordSwapStage record={{ labelTitle: "B" }} spinState={VinylSpinState.Idle} swapKey="b" />);
    });
    act(() => {
      rerender(<RecordSwapStage record={{ labelTitle: "C" }} spinState={VinylSpinState.Idle} swapKey="c" />);
    });
    expect(built[0].cancel).toHaveBeenCalled();
    expect(mockBuild).toHaveBeenCalledTimes(2);
  });

  it("swaps instantly without a timeline or coast wait under reduced motion", () => {
    mockReducedMotion.mockReturnValue(true);
    const onSettled = vi.fn();
    const { container, rerender } = render(
      <RecordSwapStage
        record={{ labelTitle: "A" }}
        spinState={VinylSpinState.Playing}
        swapKey="a"
        onSettled={onSettled}
      />,
    );
    act(() => {
      rerender(
        <RecordSwapStage
          record={{ labelTitle: "B" }}
          spinState={VinylSpinState.Playing}
          swapKey="b"
          onSettled={onSettled}
        />,
      );
    });
    // Instant swap: the new record is shown, no outgoing buffer, no timeline, and
    // no settle callback (audio continues seamlessly on the reduced-motion path).
    expect(vinylCount(container)).toBe(1);
    expect(mockBuild).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });
});
