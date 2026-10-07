import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe("AudioPlayer playback lock", () => {
  function stubPlayback() {
    vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    return vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(() => new Promise<void>(() => {}));
  }

  it("disables the play button while locked and keeps its playable label", () => {
    stubPlayback();
    render(<AudioPlayer previewUrl="/preview.mp3" trackTitle="Blue Train" playbackLocked />);

    expect(screen.getByRole("button", { name: "Play preview" })).toBeDisabled();
  });

  it("ignores the spacebar while locked and answers it once unlocked", () => {
    const playMock = stubPlayback();
    const { rerender } = render(<AudioPlayer previewUrl="/preview.mp3" trackTitle="Blue Train" playbackLocked />);

    fireEvent.keyDown(window, { code: "Space" });
    expect(playMock).not.toHaveBeenCalled();

    rerender(<AudioPlayer previewUrl="/preview.mp3" trackTitle="Blue Train" playbackLocked={false} />);
    fireEvent.keyDown(window, { code: "Space" });
    expect(playMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * A Web Audio stand-in for jsdom, which has none. It records every media
 * element routed into the graph, because that routing is what feeds the
 * display's analyzer.
 */
function stubWebAudio() {
  class FakeNode {
    connect = vi.fn();
    disconnect = vi.fn();
  }
  class FakeAnalyser extends FakeNode {
    fftSize = 128;
    smoothingTimeConstant = 0;
    frequencyBinCount = 64;
    getByteFrequencyData = vi.fn();
    getByteTimeDomainData = vi.fn();
  }
  class FakeGain extends FakeNode {
    gain = { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
  }
  class FakeMediaSource extends FakeNode {
    constructor(readonly mediaElement: HTMLMediaElement) {
      super();
    }
  }
  const mediaSources: FakeMediaSource[] = [];
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = new FakeNode();
    onstatechange: (() => void) | null = null;
    createChannelSplitter() {
      return new FakeNode();
    }
    createAnalyser() {
      return new FakeAnalyser();
    }
    createGain() {
      return new FakeGain();
    }
    createMediaElementSource(element: HTMLMediaElement) {
      const source = new FakeMediaSource(element);
      mediaSources.push(source);
      return source;
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  return mediaSources;
}

describe("AudioPlayer analyzer across a track switch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes the next track into the analyzer when the song changes during playback", async () => {
    const mediaSources = stubWebAudio();
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

    const { rerender } = render(<AudioPlayer previewUrl="/first.mp3" trackTitle="First" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Play preview" }));
    });
    rerender(<AudioPlayer previewUrl="/second.mp3" trackTitle="Second" />);
    // Past the deferred teardown of the first track's graph.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    expect(mediaSources).toHaveLength(2);
    const [firstSource, secondSource] = mediaSources;
    expect(secondSource?.mediaElement.src).toMatch(/\/second\.mp3$/);
    expect(firstSource?.disconnect).toHaveBeenCalled();
    expect(secondSource?.disconnect).not.toHaveBeenCalled();
  });
});
