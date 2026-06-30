import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTurntablePlayer } from "@/components/turntable/TurntablePlayerContext";
import { TurntablePlayerProvider } from "@/components/turntable/TurntablePlayerProvider";
import { LocaleProvider } from "@/i18n/context";

/**
 * Captures every audio element the engine drives (recorded from `play()`'s
 * `this`) so a test can dispatch lifecycle events (`ended`) on the actual
 * element the hub listens to.
 */
const playedAudioElements: HTMLAudioElement[] = [];

/** Thin hub probe: surfaces the hub view-model and the play/pause trigger. */
function HubProbe() {
  const hub = useTurntablePlayer();
  return (
    <div
      data-testid="hub"
      data-speed={hub.speed}
      data-power={hub.power}
      data-spin={hub.spinState}
      data-playing={String(hub.isPlaying)}
    >
      <button type="button" onClick={hub.togglePlay}>
        toggle
      </button>
    </div>
  );
}

function renderHub() {
  return render(
    <LocaleProvider initialLocale="en">
      <TurntablePlayerProvider previewUrl="/preview.mp3" trackTitle="Blue Train">
        <HubProbe />
      </TurntablePlayerProvider>
    </LocaleProvider>,
  );
}

function hub() {
  return screen.getByTestId("hub");
}

function latestAudio(): HTMLAudioElement {
  const audio = playedAudioElements.at(-1);
  if (!audio) throw new Error("no audio element was played");
  return audio;
}

beforeEach(() => {
  playedAudioElements.length = 0;
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLAudioElement) {
    playedAudioElements.push(this);
    return Promise.resolve();
  });
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TurntablePlayerProvider", () => {
  it("starts at Standby/idle/off before any interaction", () => {
    renderHub();
    expect(hub()).toHaveAttribute("data-speed", "standby");
    expect(hub()).toHaveAttribute("data-power", "standby");
    expect(hub()).toHaveAttribute("data-spin", "idle");
    expect(hub()).toHaveAttribute("data-playing", "false");
  });

  it("sets Rpm33 + power On and spins on play start", async () => {
    renderHub();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    });

    expect(hub()).toHaveAttribute("data-speed", "rpm33");
    expect(hub()).toHaveAttribute("data-power", "on");
    expect(hub()).toHaveAttribute("data-spin", "playing");
    expect(hub()).toHaveAttribute("data-playing", "true");
  });

  it("pausing drops to Standby, powers off, and coasts", async () => {
    renderHub();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    });
    expect(hub()).toHaveAttribute("data-playing", "true");

    const pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, "pause");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    });

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(hub()).toHaveAttribute("data-speed", "standby");
    expect(hub()).toHaveAttribute("data-power", "standby");
    expect(hub()).toHaveAttribute("data-playing", "false");
    expect(hub()).toHaveAttribute("data-spin", "coasting");
  });

  it("coasts then settles to idle when the track ends", async () => {
    vi.useFakeTimers();
    try {
      renderHub();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "toggle" }));
      });
      expect(hub()).toHaveAttribute("data-spin", "playing");

      // The engine's "ended" event reports Ready: the hub winds the rotor down
      // (Coasting) and drops the speed back to Standby.
      act(() => {
        latestAudio().dispatchEvent(new Event("ended"));
      });
      expect(hub()).toHaveAttribute("data-spin", "coasting");
      expect(hub()).toHaveAttribute("data-speed", "standby");
      expect(hub()).toHaveAttribute("data-power", "standby");

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(hub()).toHaveAttribute("data-spin", "idle");
    } finally {
      vi.useRealTimers();
    }
  });
});
