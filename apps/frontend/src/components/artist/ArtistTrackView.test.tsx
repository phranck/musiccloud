import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArtistTrackView } from "@/components/artist/ArtistTrackView";

vi.mock("@/hooks/useTrackResolve", () => ({
  useTrackResolve: () => ({ resolving: false, activate: vi.fn() }),
}));

const FULL = "var(--neu-radius)";
const INNER = "min(5px, var(--neu-radius))";
const ARTWORK_INNER = "min(5px, var(--mc-grouped-row-radius))";
const ARTWORK_OUTER = "max(0px, calc(var(--mc-grouped-row-radius) - var(--mc-pad-track, 0.25rem)))";

function item(index: number) {
  return {
    track: {
      title: `Track ${index + 1}`,
      artists: ["Artist"],
      albumName: "Album",
      artworkUrl: `https://example.test/${index + 1}.jpg`,
      durationMs: null,
      deezerUrl: `https://example.test/tracks/${index + 1}`,
      shortId: null,
    },
  };
}

describe("ArtistTrackView grouped corners", () => {
  it("derives rows and left-hugging artwork from their single-column list positions", () => {
    const { container } = render(<ArtistTrackView items={[item(0), item(1)]} />);

    const rows = Array.from(container.querySelectorAll("button"));
    const artwork = Array.from(container.querySelectorAll<HTMLElement>(".mc-row-art"));

    expect(rows[0]).toHaveStyle({
      borderTopLeftRadius: FULL,
      borderTopRightRadius: FULL,
      borderBottomLeftRadius: INNER,
      borderBottomRightRadius: INNER,
    });
    expect(rows[0]?.style.getPropertyValue("--mc-grouped-row-radius")).toBe(FULL);
    expect(artwork[0]).toHaveStyle({
      borderTopLeftRadius: ARTWORK_OUTER,
      borderTopRightRadius: ARTWORK_INNER,
      borderBottomLeftRadius: ARTWORK_INNER,
      borderBottomRightRadius: ARTWORK_INNER,
    });
    expect(rows[1]).toHaveStyle({
      borderTopLeftRadius: INNER,
      borderTopRightRadius: INNER,
      borderBottomLeftRadius: FULL,
      borderBottomRightRadius: FULL,
    });
    expect(artwork[1]).toHaveStyle({
      borderTopLeftRadius: ARTWORK_INNER,
      borderTopRightRadius: ARTWORK_INNER,
      borderBottomLeftRadius: ARTWORK_OUTER,
      borderBottomRightRadius: ARTWORK_INNER,
    });
  });

  it("truncates long track text while retaining both full values in native tooltips", () => {
    const title = "The Sidewinder (Remastered 1999/Rudy Van Gelder Edition)";
    const subtitle = "The Sidewinder (The Rudy Van Gelder Edition)";
    const longTrack = item(0);
    longTrack.track.title = title;
    longTrack.track.albumName = subtitle;

    render(<ArtistTrackView items={[longTrack]} />);

    const titleLine = screen.getByText(title);
    const subtitleLine = screen.getByText(subtitle);

    expect(titleLine).toHaveClass("truncate");
    expect(titleLine).toHaveAttribute("title", title);
    expect(subtitleLine).toHaveClass("truncate");
    expect(subtitleLine).toHaveAttribute("title", subtitle);
  });
});
