import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArtistTrackContent } from "@/components/artist/ArtistTrackContent";
import { TrackListView } from "@/hooks/useTrackListView";

/**
 * Cross-fade wiring of ArtistTrackContent (the visual morph itself is browser-
 * verified — jsdom has no layout engine). The two presentations are mocked to
 * expose which view rendered and whether it carries flip ids, so these tests
 * pin: the live view renders with flip ids, the outgoing view renders as a
 * no-flip-id ghost only while a morph is in flight, and never when it equals the
 * live view.
 */

vi.mock("@/components/artist/ArtistTrackList", () => ({
  ArtistTrackList: ({ withFlipIds }: { withFlipIds?: boolean }) => (
    <div data-testid="list" data-flipids={String(withFlipIds)} />
  ),
}));

vi.mock("@/components/artist/ArtistTrackGrid", () => ({
  ArtistTrackGrid: ({ withFlipIds }: { withFlipIds?: boolean }) => (
    <div data-testid="grid" data-flipids={String(withFlipIds)} />
  ),
}));

const GHOST_SELECTOR = "[data-track-ghost]";

describe("ArtistTrackContent cross-fade", () => {
  it("renders only the live view with flip ids when no morph is in flight", () => {
    const { container, queryByTestId } = render(<ArtistTrackContent view={TrackListView.List} items={[]} />);
    expect(queryByTestId("list")?.getAttribute("data-flipids")).toBe("true");
    expect(queryByTestId("grid")).toBeNull();
    expect(container.querySelector(GHOST_SELECTOR)).toBeNull();
  });

  it("renders the outgoing view as a no-flip-id ghost during a morph", () => {
    const { container, getByTestId } = render(
      <ArtistTrackContent view={TrackListView.Grid} outgoingView={TrackListView.List} items={[]} />,
    );
    expect(getByTestId("grid").getAttribute("data-flipids")).toBe("true");
    const ghost = container.querySelector(GHOST_SELECTOR);
    expect(ghost).not.toBeNull();
    expect(ghost?.querySelector('[data-testid="list"]')?.getAttribute("data-flipids")).toBe("false");
  });

  it("renders no ghost when the outgoing view equals the live view", () => {
    const { container } = render(
      <ArtistTrackContent view={TrackListView.Grid} outgoingView={TrackListView.Grid} items={[]} />,
    );
    expect(container.querySelector(GHOST_SELECTOR)).toBeNull();
  });
});
