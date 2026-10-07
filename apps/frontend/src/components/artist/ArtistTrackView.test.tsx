import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArtistTrackView } from "@/components/artist/ArtistTrackView";
import type { NowPlayingTrack } from "@/components/artist/nowPlayingTrack";
import { AudioStatus } from "@/components/audio/AudioStatus";

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

describe("ArtistTrackView playback mark", () => {
  function nowPlaying(status: NowPlayingTrack["status"], trackUrl: string): NowPlayingTrack {
    return { status, trackUrls: [trackUrl], title: "", artist: "" };
  }

  it("marks only the row the player holds, with the player's state", () => {
    const items = [item(0), item(1), item(2)];
    const { container } = render(
      <ArtistTrackView items={items} nowPlaying={nowPlaying(AudioStatus.Paused, items[1].track.deezerUrl)} />,
    );

    const rows = Array.from(container.querySelectorAll("button"));
    expect(rows[1]).toHaveAttribute("data-playback", AudioStatus.Paused);
    expect(rows[1]).toHaveAttribute("aria-current", "true");
    for (const other of [rows[0], rows[2]]) {
      expect(other).not.toHaveAttribute("data-playback");
      expect(other).not.toHaveAttribute("aria-current");
    }
  });

  /**
   * The ring and the bars fade through a transition on the row, which only runs
   * when the row that is already on screen changes its attribute.
   */
  it("changes the mark on the same row element, which carries its bars in every state", () => {
    const items = [item(0), item(1)];
    const { container, rerender } = render(
      <ArtistTrackView items={items} nowPlaying={nowPlaying(AudioStatus.Playing, items[0].track.deezerUrl)} />,
    );
    const markedRow = container.querySelector("button");
    expect(markedRow).toHaveAttribute("data-playback", AudioStatus.Playing);

    rerender(<ArtistTrackView items={items} nowPlaying={null} />);

    expect(container.querySelector("button")).toBe(markedRow);
    expect(markedRow).not.toHaveAttribute("data-playback");
    for (const row of container.querySelectorAll("button")) {
      expect(row.querySelector(".mc-playback-bars")).toHaveAttribute("aria-hidden", "true");
    }
  });
});
