import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArtistTrackContent } from "@/components/artist/ArtistTrackContent";
import { TrackListView } from "@/hooks/useTrackListView";

/**
 * ArtistTrackContent is a thin list/grid switch. The presentations are mocked so
 * these tests pin which one renders per view; the cover morph itself lives in
 * useTrackViewMorph and is browser-verified (jsdom has no layout engine).
 */

vi.mock("@/components/artist/ArtistTrackList", () => ({
  ArtistTrackList: () => <div data-testid="list" />,
}));

vi.mock("@/components/artist/ArtistTrackGrid", () => ({
  ArtistTrackGrid: () => <div data-testid="grid" />,
}));

describe("ArtistTrackContent", () => {
  it("renders the list presentation for the list view", () => {
    const { queryByTestId } = render(<ArtistTrackContent view={TrackListView.List} items={[]} />);
    expect(queryByTestId("list")).not.toBeNull();
    expect(queryByTestId("grid")).toBeNull();
  });

  it("renders the grid presentation for the grid view", () => {
    const { queryByTestId } = render(<ArtistTrackContent view={TrackListView.Grid} items={[]} />);
    expect(queryByTestId("grid")).not.toBeNull();
    expect(queryByTestId("list")).toBeNull();
  });
});
