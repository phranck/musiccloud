import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtistTrackContent } from "@/components/artist/ArtistTrackContent";
import { TrackListView } from "@/hooks/useTrackListView";

/**
 * ArtistTrackContent keeps both views permanently mounted as layers and sizes the
 * card to the ACTIVE view via an invisible in-flow spacer. The single-view renderer
 * is mocked so these tests pin the wiring: the spacer (a non-fillHeight copy of the
 * active view) plus both fillHeight view layers, where the visible layer is the one
 * that is not aria-hidden. The height animation and slide/scroll geometry are
 * browser-verified (jsdom has no layout engine).
 */

vi.mock("@/components/artist/ArtistTrackView", () => ({
  ArtistTrackView: ({ view, fillHeight }: { view: string; fillHeight?: boolean }) => (
    <div data-testid="view" data-view={view} data-fill={fillHeight ? "1" : "0"} />
  ),
}));

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The visible view: a fillHeight layer whose wrapper is not aria-hidden. */
function visibleView() {
  return screen
    .getAllByTestId("view")
    .find((el) => el.getAttribute("data-fill") === "1" && !el.parentElement?.hasAttribute("aria-hidden"));
}

/** The two fillHeight layers (both views), excluding the non-filling height spacer. */
function layerViews() {
  return screen.getAllByTestId("view").filter((el) => el.getAttribute("data-fill") === "1");
}

describe("ArtistTrackContent", () => {
  it("shows the list view when selected", () => {
    render(<ArtistTrackContent view={TrackListView.List} items={[]} />);
    expect(visibleView()?.getAttribute("data-view")).toBe("list");
  });

  it("shows the grid view when selected", () => {
    render(<ArtistTrackContent view={TrackListView.Grid} items={[]} />);
    expect(visibleView()?.getAttribute("data-view")).toBe("grid");
  });

  it("keeps both views mounted as layers", () => {
    render(<ArtistTrackContent view={TrackListView.List} items={[]} />);
    expect(
      layerViews()
        .map((el) => el.getAttribute("data-view"))
        .sort(),
    ).toEqual(["grid", "list"]);
  });

  it("sizes the card to the active view via an invisible spacer", () => {
    const { rerender } = render(<ArtistTrackContent view={TrackListView.List} items={[]} />);
    const spacer = () => screen.getAllByTestId("view").find((el) => el.getAttribute("data-fill") === "0");
    expect(spacer()?.getAttribute("data-view")).toBe("list");
    rerender(<ArtistTrackContent view={TrackListView.Grid} items={[]} />);
    expect(spacer()?.getAttribute("data-view")).toBe("grid");
  });

  it("switches the visible view on a view change", () => {
    const { rerender } = render(<ArtistTrackContent view={TrackListView.List} items={[]} />);
    expect(visibleView()?.getAttribute("data-view")).toBe("list");
    rerender(<ArtistTrackContent view={TrackListView.Grid} items={[]} />);
    expect(visibleView()?.getAttribute("data-view")).toBe("grid");
  });
});
