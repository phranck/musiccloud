import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioPlayer } from "@/components/audio/AudioPlayer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AudioPlayer playback intent", () => {
  it("reports playback intent before audio.play resolves", () => {
    const callOrder: string[] = [];
    const playMock = vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(() => {
      callOrder.push("play");
      return new Promise<void>(() => {});
    });
    vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

    render(
      <AudioPlayer
        previewUrl="/preview.mp3"
        trackTitle="Blue Train"
        onPlaybackIntent={() => callOrder.push("intent")}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Play preview" }));

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["intent", "play"]);
  });
});
