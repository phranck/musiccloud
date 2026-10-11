import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroInput } from "@/components/landing/HeroInput";
import { InputState } from "@/lib/types/app";

const SEARCH_INPUT_LABEL = "Search for music by link or name";

// jsdom has no matchMedia; HeroInput and its submit slot query it.
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderHeroInput(state: InputState, onSubmit = vi.fn()) {
  render(
    <HeroInput
      value="https://open.spotify.com/track/123"
      onChange={vi.fn()}
      onSubmit={onSubmit}
      onClear={vi.fn()}
      state={state}
    />,
  );
  return onSubmit;
}

describe("HeroInput Enter", () => {
  /**
   * A pasted link submits on its own after 300 ms, and pressing Enter by habit
   * then sent a second request that raced the first.
   */
  it("does not submit again while a request is running", () => {
    const onSubmit = renderHeroInput(InputState.Loading);

    fireEvent.keyDown(screen.getByLabelText(SEARCH_INPUT_LABEL), { key: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the trimmed value when nothing is running", () => {
    const onSubmit = renderHeroInput(InputState.Idle);

    fireEvent.keyDown(screen.getByLabelText(SEARCH_INPUT_LABEL), { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledWith("https://open.spotify.com/track/123");
  });
});
