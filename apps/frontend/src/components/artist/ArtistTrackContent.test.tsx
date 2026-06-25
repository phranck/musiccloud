import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtistTrackContent } from "@/components/artist/ArtistTrackContent";
import { TrackListView } from "@/hooks/useTrackListView";

/**
 * ArtistTrackContent slides between the list and grid views at a fixed (grid)
 * card height. The single-view renderer is mocked so these tests pin the wiring:
 * an invisible grid height-anchor plus the active view (the one that fills the
 * height), and under reduced motion a switch is instant (no outgoing slide layer).
 * The slide and the fixed-height layering are browser-verified (jsdom has no
 * layout engine).
 */

vi.mock("@/components/artist/ArtistTrackView", () => ({
  ArtistTrackView: ({ view, fillHeight }: { view: string; fillHeight?: boolean }) => (
    <div data-testid="view" data-view={view} data-fill={fillHeight ? "1" : "0"} />
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The active (visible) view fills the fixed height; the height anchor does not. */
function activeView() {
  return screen.getAllByTestId("view").find((el) => el.getAttribute("data-fill") === "1");
}

describe("ArtistTrackContent", () => {
  it("renders the list view as the active layer", () => {
    render(<ArtistTrackContent view={TrackListView.List} items={[]} />);
    expect(activeView()?.getAttribute("data-view")).toBe("list");
  });

  it("renders the grid view as the active layer", () => {
    render(<ArtistTrackContent view={TrackListView.Grid} items={[]} />);
    expect(activeView()?.getAttribute("data-view")).toBe("grid");
  });

  it("anchors the card height to an invisible grid view", () => {
    render(<ArtistTrackContent view={TrackListView.List} items={[]} />);
    // Whatever the active view, the non-filling layer is always the grid anchor.
    const anchor = screen.getAllByTestId("view").find((el) => el.getAttribute("data-fill") === "0");
    expect(anchor?.getAttribute("data-view")).toBe("grid");
  });

  it("switches instantly under reduced motion, with no outgoing slide layer", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true } as MediaQueryList));
    const { rerender } = render(<ArtistTrackContent view={TrackListView.List} items={[]} />);
    rerender(<ArtistTrackContent view={TrackListView.Grid} items={[]} />);
    // Anchor + active only; a slide would mount a third (outgoing) view.
    expect(screen.getAllByTestId("view")).toHaveLength(2);
    expect(activeView()?.getAttribute("data-view")).toBe("grid");
  });
});
