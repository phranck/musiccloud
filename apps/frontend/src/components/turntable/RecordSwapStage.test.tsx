import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordSwapStage } from "@/components/turntable/RecordSwapStage";
import { VinylSpinState } from "@/components/vinyl/VinylRecord.types";
import { buildRecordSwapTimeline } from "@/lib/motion/recordSwap";

vi.mock("@/lib/motion/recordSwap");
const mockBuild = vi.mocked(buildRecordSwapTimeline);

interface Built {
  onSettle: () => void;
  cancel: ReturnType<typeof vi.fn>;
}
let built: Built[];

beforeEach(() => {
  built = [];
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

  it("shows both records and starts the swap on a swapKey change, then unmounts the outgoing on settle", () => {
    const { container, rerender } = render(
      <RecordSwapStage record={{ labelTitle: "A" }} spinState={VinylSpinState.Playing} swapKey="a" />,
    );
    act(() => {
      rerender(<RecordSwapStage record={{ labelTitle: "B" }} spinState={VinylSpinState.Playing} swapKey="b" />);
    });
    expect(vinylCount(container)).toBe(2);
    expect(mockBuild).toHaveBeenCalledTimes(1);

    act(() => {
      built[0].onSettle();
    });
    expect(vinylCount(container)).toBe(1);
  });

  it("cancels the in-flight swap and starts a new one on an overlapping swapKey change", () => {
    const { rerender } = render(
      <RecordSwapStage record={{ labelTitle: "A" }} spinState={VinylSpinState.Playing} swapKey="a" />,
    );
    act(() => {
      rerender(<RecordSwapStage record={{ labelTitle: "B" }} spinState={VinylSpinState.Playing} swapKey="b" />);
    });
    act(() => {
      rerender(<RecordSwapStage record={{ labelTitle: "C" }} spinState={VinylSpinState.Playing} swapKey="c" />);
    });
    expect(built[0].cancel).toHaveBeenCalled();
    expect(mockBuild).toHaveBeenCalledTimes(2);
  });

  it("settles immediately without a lingering outgoing when the factory returns null (reduced motion)", () => {
    mockBuild.mockReturnValue(null);
    const { container, rerender } = render(
      <RecordSwapStage record={{ labelTitle: "A" }} spinState={VinylSpinState.Playing} swapKey="a" />,
    );
    act(() => {
      rerender(<RecordSwapStage record={{ labelTitle: "B" }} spinState={VinylSpinState.Playing} swapKey="b" />);
    });
    expect(vinylCount(container)).toBe(1);
  });
});
