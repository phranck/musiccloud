import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTurntablePlayer } from "@/components/turntable/TurntablePlayerContext";
import { TurntablePlayerProvider } from "@/components/turntable/TurntablePlayerProvider";
import { prefersReducedMotion } from "@/lib/motion/setup";

// Keep the real setup module (GSAP registration is harmless in jsdom) but make the
// reduced-motion read a controllable spy so a test can exercise the instant path.
vi.mock("@/lib/motion/setup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/motion/setup")>();
  return { ...actual, prefersReducedMotion: vi.fn(() => false) };
});
const mockReducedMotion = vi.mocked(prefersReducedMotion);

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
    <TurntablePlayerProvider previewUrl="/preview.mp3" trackTitle="Blue Train">
      <HubProbe />
    </TurntablePlayerProvider>,
  );
}

/**
 * A hub tree with a parametrized preview URL (and optional record-swap identity),
 * for source-switch rerenders. Omitting `recordSwapKey` exercises the legacy
 * continue-on-switch path; passing a changed key exercises the record swap.
 */
function tree(previewUrl: string, trackTitle: string, recordSwapKey?: string) {
  return (
    <TurntablePlayerProvider previewUrl={previewUrl} trackTitle={trackTitle} recordSwapKey={recordSwapKey}>
      <HubProbe />
    </TurntablePlayerProvider>
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
  mockReducedMotion.mockReturnValue(false);
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

  it("continues playing the new track when previewUrl changes while playing (same-album switch)", async () => {
    const { rerender } = render(tree("/a.mp3", "A"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    });
    expect(hub()).toHaveAttribute("data-playing", "true");

    await act(async () => {
      rerender(tree("/b.mp3", "B"));
    });

    expect(latestAudio().src).toContain("/b.mp3");
    expect(hub()).toHaveAttribute("data-playing", "true");
    expect(hub()).toHaveAttribute("data-spin", "playing");
  });

  it("adopts the new source without auto-playing when previewUrl changes while idle", async () => {
    const { rerender } = render(tree("/a.mp3", "A"));

    await act(async () => {
      rerender(tree("/b.mp3", "B"));
    });
    expect(playedAudioElements).toHaveLength(0);
    expect(hub()).toHaveAttribute("data-playing", "false");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    });
    expect(latestAudio().src).toContain("/b.mp3");
  });

  it("continues playing on a same-album track switch (unchanged recordSwapKey)", async () => {
    const { rerender } = render(tree("/a.mp3", "A", "album-a"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    });
    expect(hub()).toHaveAttribute("data-playing", "true");

    await act(async () => {
      rerender(tree("/a2.mp3", "A2", "album-a"));
    });

    expect(latestAudio().src).toContain("/a2.mp3");
    expect(hub()).toHaveAttribute("data-playing", "true");
    expect(hub()).toHaveAttribute("data-spin", "playing");
  });

  it("defers playback to the swap orchestration on a record swap while playing (different album)", async () => {
    const { rerender } = render(tree("/a.mp3", "A", "album-a"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    });
    expect(hub()).toHaveAttribute("data-playing", "true");
    const playsBefore = playedAudioElements.length;

    await act(async () => {
      rerender(tree("/b.mp3", "B", "album-b"));
    });

    // The new album is NOT auto-continued: no fresh play(), and the deck reports
    // Ready so the rotor winds down (Coasting). The record swap re-triggers play
    // once the disc has settled.
    expect(playedAudioElements).toHaveLength(playsBefore);
    expect(hub()).toHaveAttribute("data-playing", "false");
    expect(hub()).toHaveAttribute("data-spin", "coasting");
    expect(hub()).toHaveAttribute("data-speed", "standby");
  });

  it("continues playback under reduced motion even on a different-album switch", async () => {
    mockReducedMotion.mockReturnValue(true);
    const { rerender } = render(tree("/a.mp3", "A", "album-a"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    });
    const playsBefore = playedAudioElements.length;

    await act(async () => {
      rerender(tree("/b.mp3", "B", "album-b"));
    });

    // Reduced motion skips the coast/defer entirely: the new album continues
    // seamlessly (matching the stage's instant swap), no coasting in between.
    expect(latestAudio().src).toContain("/b.mp3");
    expect(playedAudioElements).toHaveLength(playsBefore + 1);
    expect(hub()).toHaveAttribute("data-playing", "true");
    expect(hub()).toHaveAttribute("data-spin", "playing");
  });
});
