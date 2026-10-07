import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DisambiguationPanel } from "@/components/discovery/DisambiguationPanel";
import type { DisambiguationCandidate } from "@/lib/types/disambiguation";

const CANDIDATES: DisambiguationCandidate[] = [
  { id: "deezer:1", title: "Teardrop", artists: ["Massive Attack"], albumName: "Mezzanine" },
  { id: "deezer:2", title: "Teardrop (Live)", artists: ["Massive Attack"], albumName: "Live" },
];

/** The panel's selection choreography: 520 ms plus a 30 ms margin. */
const SELECTION_ANIMATION_MS = 550;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function isSettled(promise: Promise<void>): Promise<boolean> {
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  await act(async () => {
    await Promise.resolve();
  });
  return settled;
}

describe("DisambiguationPanel selection", () => {
  /**
   * The pick used to be sent only after the selection animation, so every
   * resolve started half a second late. It now goes out on the click.
   */
  it("hands the pick over on click and settles the animation promise when the animation ends", async () => {
    const onSelect = vi.fn();
    render(<DisambiguationPanel candidates={CANDIDATES} onSelect={onSelect} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: 'Select "Teardrop" by Massive Attack' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [candidate, animationDone] = onSelect.mock.calls[0] as [DisambiguationCandidate, Promise<void>];
    expect(candidate.id).toBe("deezer:1");
    expect(await isSettled(animationDone)).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(SELECTION_ANIMATION_MS);
    });
    expect(await isSettled(animationDone)).toBe(true);
  });

  it("settles the animation promise when the panel goes away mid-animation", async () => {
    const onSelect = vi.fn();
    const { unmount } = render(<DisambiguationPanel candidates={CANDIDATES} onSelect={onSelect} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: 'Select "Teardrop" by Massive Attack' }));
    const [, animationDone] = onSelect.mock.calls[0] as [DisambiguationCandidate, Promise<void>];
    unmount();

    expect(await isSettled(animationDone)).toBe(true);
  });
});
