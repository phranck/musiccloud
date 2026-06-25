import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtistTrackContent } from "@/components/artist/ArtistTrackContent";
import { TrackListView } from "@/hooks/useTrackListView";

/**
 * ArtistTrackContent slides between the list and grid views. The single-view
 * renderer is mocked so these tests pin the wiring: the current view is rendered,
 * and under reduced motion a switch is instant (no outgoing overlay). The slide
 * animation itself is browser-verified (jsdom has no layout engine).
 */

vi.mock("@/components/artist/ArtistTrackView", () => ({
  ArtistTrackView: ({ view }: { view: string }) => <div data-testid="view" data-view={view} />,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ArtistTrackContent", () => {
  it("renders the list view", () => {
    render(<ArtistTrackContent view={TrackListView.List} items={[]} />);
    expect(screen.getByTestId("view").getAttribute("data-view")).toBe("list");
  });

  it("renders the grid view", () => {
    render(<ArtistTrackContent view={TrackListView.Grid} items={[]} />);
    expect(screen.getByTestId("view").getAttribute("data-view")).toBe("grid");
  });

  it("switches instantly under reduced motion, with no outgoing overlay", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true } as MediaQueryList));
    const { rerender } = render(<ArtistTrackContent view={TrackListView.List} items={[]} />);
    rerender(<ArtistTrackContent view={TrackListView.Grid} items={[]} />);
    expect(screen.getAllByTestId("view")).toHaveLength(1);
    expect(screen.getByTestId("view").getAttribute("data-view")).toBe("grid");
  });
});
