import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArtistTrackView } from "@/components/artist/ArtistTrackView";
import type { NowPlayingTrack } from "@/components/artist/nowPlayingTrack";
import { AudioStatus } from "@/components/audio/AudioStatus";
import {
  GROUPED_ARTWORK_INNER as ARTWORK_INNER,
  GROUPED_ARTWORK_OUTER as ARTWORK_OUTER,
  GROUPED_CORNER_FULL as FULL,
  GROUPED_CORNER_INNER as INNER,
} from "@/components/cards/groupedCorners";

vi.mock("@/hooks/useTrackResolve", () => ({
  useTrackResolve: () => ({ resolving: false, activate: vi.fn() }),
}));

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

  it.each([
    AudioStatus.Playing,
    AudioStatus.Paused,
    null,
  ])("preserves the duration without analyzer bars when playback is %s", (status) => {
    const timedItem = item(0);
    const timedTrack = { ...timedItem, track: { ...timedItem.track, durationMs: 200_000 } };
    const { container } = render(
      <ArtistTrackView
        items={[timedTrack]}
        nowPlaying={status ? nowPlaying(status, timedTrack.track.deezerUrl) : null}
      />,
    );

    expect(screen.getByText("3:20")).toBeInTheDocument();
    expect(container.querySelector(".mc-playback-bars")).toBeNull();
  });

  it("moves playback to the new track and keeps a paused track marked", () => {
    const items = [item(0), item(1)];
    const { container, rerender } = render(
      <ArtistTrackView items={items} nowPlaying={nowPlaying(AudioStatus.Playing, items[0].track.deezerUrl)} />,
    );
    const rows = Array.from(container.querySelectorAll("button"));

    rerender(<ArtistTrackView items={items} nowPlaying={nowPlaying(AudioStatus.Playing, items[1].track.deezerUrl)} />);
    expect(rows[0]).not.toHaveAttribute("data-playback");
    expect(rows[0]).not.toHaveAttribute("aria-current");
    expect(rows[1]).toHaveAttribute("data-playback", AudioStatus.Playing);

    rerender(<ArtistTrackView items={items} nowPlaying={nowPlaying(AudioStatus.Paused, items[1].track.deezerUrl)} />);
    expect(rows[1]).toHaveAttribute("data-playback", AudioStatus.Paused);
    expect(rows[1]).toHaveAttribute("aria-current", "true");
    expect(container.querySelectorAll("button")[1]).toBe(rows[1]);
  });

  it("updates the frame on the same row without rendering a simulated analyzer", () => {
    const items = [item(0), item(1)];
    const { container, rerender } = render(
      <ArtistTrackView items={items} nowPlaying={nowPlaying(AudioStatus.Playing, items[0].track.deezerUrl)} />,
    );
    const markedRow = container.querySelector("button");
    expect(markedRow).toHaveAttribute("data-playback", AudioStatus.Playing);
    expect(container.querySelector(".mc-playback-bars")).toBeNull();

    rerender(<ArtistTrackView items={items} nowPlaying={null} />);

    expect(container.querySelector("button")).toBe(markedRow);
    expect(markedRow).not.toHaveAttribute("data-playback");
    for (const row of container.querySelectorAll("button")) {
      expect(row.querySelector(".mc-playback-bars")).toBeNull();
    }
  });
});
