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

const FULL = "var(--neu-radius)";
const INNER = "min(5px, var(--neu-radius))";
const ARTWORK_INNER = "min(5px, var(--mc-grouped-row-radius))";
const ARTWORK_OUTER = "max(0px, calc(var(--mc-grouped-row-radius) - var(--mc-pad-track, 0.25rem)))";

const THREE_CANDIDATES: DisambiguationCandidate[] = [
  ...CANDIDATES,
  { id: "deezer:3", title: "Teardrop (Remix)", artists: ["Massive Attack"], albumName: "Remixes" },
];

function candidateRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-disambiguation-card] > button"));
}

function artworkFrames(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".mc-row-art"));
}

describe("DisambiguationPanel grouped corners", () => {
  /**
   * The rows enter scaled, so a reading of the live layout on mount sees a lone
   * row stop short of the well's right edge. The corners come from list
   * positions, which no entrance changes.
   */
  it("gives a lone candidate row the well's radius on all four corners", () => {
    const { container } = render(
      <DisambiguationPanel candidates={CANDIDATES.slice(0, 1)} onSelect={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(candidateRows(container)[0]).toHaveStyle({
      borderTopLeftRadius: FULL,
      borderTopRightRadius: FULL,
      borderBottomLeftRadius: FULL,
      borderBottomRightRadius: FULL,
    });
    expect(artworkFrames(container)[0]).toHaveStyle({
      borderTopLeftRadius: ARTWORK_OUTER,
      borderTopRightRadius: ARTWORK_INNER,
      borderBottomLeftRadius: ARTWORK_OUTER,
      borderBottomRightRadius: ARTWORK_INNER,
    });
  });

  it("promotes only the first row's top corners and the last row's bottom corners", () => {
    const { container } = render(
      <DisambiguationPanel candidates={THREE_CANDIDATES} onSelect={vi.fn()} onCancel={vi.fn()} />,
    );
    const [first, middle, last] = candidateRows(container);
    const [firstArtwork, middleArtwork, lastArtwork] = artworkFrames(container);

    expect(first).toHaveStyle({
      borderTopLeftRadius: FULL,
      borderTopRightRadius: FULL,
      borderBottomLeftRadius: INNER,
      borderBottomRightRadius: INNER,
    });
    expect(middle).toHaveStyle({
      borderTopLeftRadius: INNER,
      borderTopRightRadius: INNER,
      borderBottomLeftRadius: INNER,
      borderBottomRightRadius: INNER,
    });
    expect(last).toHaveStyle({
      borderTopLeftRadius: INNER,
      borderTopRightRadius: INNER,
      borderBottomLeftRadius: FULL,
      borderBottomRightRadius: FULL,
    });
    expect(firstArtwork).toHaveStyle({ borderTopLeftRadius: ARTWORK_OUTER, borderBottomLeftRadius: ARTWORK_INNER });
    expect(middleArtwork).toHaveStyle({ borderTopLeftRadius: ARTWORK_INNER, borderBottomLeftRadius: ARTWORK_INNER });
    expect(lastArtwork).toHaveStyle({ borderTopLeftRadius: ARTWORK_INNER, borderBottomLeftRadius: ARTWORK_OUTER });
  });

  it("rounds the picked row as the only one left in the well", () => {
    const { container } = render(
      <DisambiguationPanel candidates={THREE_CANDIDATES} onSelect={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: 'Select "Teardrop (Live)" by Massive Attack' }));

    expect(candidateRows(container)[1]).toHaveStyle({
      borderTopLeftRadius: FULL,
      borderTopRightRadius: FULL,
      borderBottomLeftRadius: FULL,
      borderBottomRightRadius: FULL,
    });
  });
});
