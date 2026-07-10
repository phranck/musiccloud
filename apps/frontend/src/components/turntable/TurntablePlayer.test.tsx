import type { VinylLayout } from "@musiccloud/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode, useMemo } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TurntableAnalyzerSlot } from "@/components/turntable/TurntableAnalyzerSlot";
import { TurntablePlayer } from "@/components/turntable/TurntablePlayer";
import {
  TurntablePlayerContext,
  type TurntablePlayerContextValue,
  TurntablePower,
  TurntableSpeed,
  type TurntableSpeed as TurntableSpeedValue,
} from "@/components/turntable/TurntablePlayerContext";
import { TurntablePlayerProvider } from "@/components/turntable/TurntablePlayerProvider";
import { derivePower } from "@/components/turntable/turntableState";
import { VinylSpinState, type VinylSpinState as VinylSpinStateValue } from "@/components/vinyl/VinylRecord.types";
import { LocaleProvider } from "@/i18n/context";

const originalAnimate = HTMLElement.prototype.animate;

afterEach(() => {
  if (originalAnimate) {
    HTMLElement.prototype.animate = originalAnimate;
  } else {
    // jsdom does not implement WAAPI by default.
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
  vi.restoreAllMocks();
});

/** A no-op transport callback shared by the stubbed hub value. */
function noop() {}

/**
 * Provides a fixed turntable hub value so the compound can be tested in
 * isolation from the audio engine. Only `speed`/`spinState` (and the derived
 * `power`) vary per test; the transport view-model is stubbed.
 *
 * @param speed - Speed the hub reports (also drives `power`).
 * @param spinState - Spin state the hub reports to the platter.
 * @param children - Compound parts under test.
 */
function StubHubProvider({
  speed,
  spinState,
  children,
}: {
  speed: TurntableSpeedValue;
  spinState: VinylSpinStateValue;
  children: ReactNode;
}) {
  const value = useMemo<TurntablePlayerContextValue>(
    () => ({
      ariaLabel: "Play preview",
      isDisabled: false,
      isLoading: false,
      isPlaying: spinState === VinylSpinState.Playing,
      isUnavailable: false,
      mediaLabel: "Preview",
      power: derivePower(speed),
      seekBy: noop,
      seekToNearEnd: noop,
      seekToStart: noop,
      speed,
      spinState,
      timeText: "0:00",
      title: undefined,
      togglePlay: noop,
      trackTitle: "Blue Train",
    }),
    [speed, spinState],
  );
  return <TurntablePlayerContext.Provider value={value}>{children}</TurntablePlayerContext.Provider>;
}

const RECORD = {
  className: "h-full w-full",
  labelArtworkUrl: "/covers/blue-train.jpg",
  labelSubtitle: "John Coltrane",
  labelTitle: "Blue Train",
  labelYear: "1958",
};

const VINYL_LAYOUT: VinylLayout = {
  discogsReleaseId: "10013707",
  sides: [
    {
      label: "A",
      tracks: [{ durationMs: 240000, position: "A1", title: "Blue Train" }],
    },
  ],
};

describe("TurntablePlayer compound", () => {
  it("renders the LED, platter, control and static knob labels", () => {
    const { container } = render(
      <StubHubProvider speed={TurntableSpeed.Rpm33} spinState={VinylSpinState.Playing}>
        <TurntablePlayer record={RECORD} swapKey="tp-test" />
      </StubHubProvider>,
    );

    expect(screen.getByLabelText("Turntable")).toBeInTheDocument();
    expect(container.querySelector("[data-turntable-brand='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-turntable-platter='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-turntable-spindle='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-turntable-spindle-shadow='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-turntable-led='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-turntable-speed-knob='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-turntable-speed-indicator='true']")).toBeInTheDocument();

    // The static speed captions are part of the control cluster; "45" stays as a
    // permanent unlit deck print even though the deck runs only at 33.
    expect(screen.getByText("33")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("ON")).toBeInTheDocument();
    expect(screen.getByText("STANDBY")).toBeInTheDocument();
  });

  it("lights the 33 caption white and the ON caption amber while playing", () => {
    const { rerender } = render(
      <StubHubProvider speed={TurntableSpeed.Rpm33} spinState={VinylSpinState.Playing}>
        <TurntablePlayer.Control />
      </StubHubProvider>,
    );

    // Playing: "33" lit white, "ON" lit amber (powered); "45" is never lit.
    expect(screen.getByText("33")).toHaveStyle({ color: "rgb(255, 255, 255)" });
    expect(screen.getByText("ON")).toHaveStyle({ color: "rgb(255, 159, 74)" });
    expect(screen.getByText("45")).not.toHaveStyle({ color: "rgb(255, 255, 255)" });

    rerender(
      <StubHubProvider speed={TurntableSpeed.Standby} spinState={VinylSpinState.Idle}>
        <TurntablePlayer.Control />
      </StubHubProvider>,
    );

    // Standby: powered off, so nothing is lit.
    expect(screen.getByText("ON")).not.toHaveStyle({ color: "rgb(255, 159, 74)" });
    expect(screen.getByText("33")).not.toHaveStyle({ color: "rgb(255, 255, 255)" });
  });

  it("lights the LED power attribute from the hub power state", () => {
    const { container, rerender } = render(
      <StubHubProvider speed={TurntableSpeed.Rpm33} spinState={VinylSpinState.Playing}>
        <TurntablePlayer.LED />
      </StubHubProvider>,
    );

    // Rpm33 -> power On.
    expect(container.querySelector("[data-turntable-led='true']")).toHaveAttribute(
      "data-turntable-led-power",
      TurntablePower.On,
    );

    rerender(
      <StubHubProvider speed={TurntableSpeed.Standby} spinState={VinylSpinState.Idle}>
        <TurntablePlayer.LED />
      </StubHubProvider>,
    );

    // Standby -> power Standby.
    expect(container.querySelector("[data-turntable-led='true']")).toHaveAttribute(
      "data-turntable-led-power",
      TurntablePower.Standby,
    );
  });

  it("renders the Discogs layout LED from the record layout before the power LED", () => {
    const { container, rerender } = render(
      <StubHubProvider speed={TurntableSpeed.Standby} spinState={VinylSpinState.Idle}>
        <TurntablePlayer record={{ ...RECORD, vinylLayout: VINYL_LAYOUT }} swapKey="tp-test" />
      </StubHubProvider>,
    );

    const layoutLed = container.querySelector("[data-turntable-layout-led='true']");
    const powerLed = container.querySelector("[data-turntable-led='true']");
    expect(layoutLed).toHaveAttribute("data-turntable-layout-led-state", "lit");
    expect(layoutLed).toHaveClass("right-[9.6%]");
    expect(layoutLed?.compareDocumentPosition(powerLed as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    rerender(
      <StubHubProvider speed={TurntableSpeed.Standby} spinState={VinylSpinState.Idle}>
        <TurntablePlayer record={RECORD} swapKey="tp-test" />
      </StubHubProvider>,
    );

    expect(container.querySelector("[data-turntable-layout-led='true']")).toHaveAttribute(
      "data-turntable-layout-led-state",
      "off",
    );
  });

  it("eases the knob indicator between the Standby and 33 angles", () => {
    const { container, rerender } = render(
      <StubHubProvider speed={TurntableSpeed.Rpm33} spinState={VinylSpinState.Playing}>
        <TurntablePlayer.Control />
      </StubHubProvider>,
    );

    // Playing: the indicator points at the 33 caption (210deg) on a GPU layer.
    expect(container.querySelector("[data-turntable-speed-indicator='true']")).toHaveStyle({
      transform: "translateY(-50%) rotate(210deg) translateZ(0)",
      transformOrigin: "0% 50%",
    });

    rerender(
      <StubHubProvider speed={TurntableSpeed.Standby} spinState={VinylSpinState.Idle}>
        <TurntablePlayer.Control />
      </StubHubProvider>,
    );

    // Stopped: the indicator rests at the STANDBY caption (150deg).
    expect(container.querySelector("[data-turntable-speed-indicator='true']")).toHaveStyle({
      transform: "translateY(-50%) rotate(150deg) translateZ(0)",
    });
  });

  it("forwards the hub spin state to the embedded vinyl record", () => {
    render(
      <StubHubProvider speed={TurntableSpeed.Rpm33} spinState={VinylSpinState.Coasting}>
        <TurntablePlayer.Platter record={RECORD} swapKey="tp-test" />
      </StubHubProvider>,
    );

    expect(screen.getByLabelText("Vinyl record for Blue Train")).toHaveAttribute(
      "data-spin-state",
      VinylSpinState.Coasting,
    );
  });

  it("loops the rotor at the fixed 1800 ms revolution while playing", () => {
    const cancel = vi.fn();
    const commitStyles = vi.fn();
    const animate = vi.fn(() => ({ cancel, commitStyles })) as unknown as typeof HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate;

    render(
      <StubHubProvider speed={TurntableSpeed.Rpm33} spinState={VinylSpinState.Playing}>
        <TurntablePlayer.Platter record={RECORD} swapKey="tp-test" />
      </StubHubProvider>,
    );

    expect(animate).toHaveBeenLastCalledWith(expect.anything(), {
      duration: 1800,
      easing: "linear",
      iterations: Infinity,
    });
  });

  it("exposes Control.Knob and Control.KnobLabels as compound members", () => {
    const { container } = render(
      <>
        <TurntablePlayer.Control.Knob speed={TurntableSpeed.Rpm33} />
        <TurntablePlayer.Control.KnobLabels />
      </>,
    );

    expect(container.querySelector("[data-turntable-speed-knob='true']")).toBeInTheDocument();
    // Control.Knob is the static decorative knob: plain transform, no GPU layer hint.
    expect(container.querySelector("[data-turntable-speed-indicator='true']")).toHaveStyle({
      transform: "translateY(-50%) rotate(210deg)",
    });
    expect(screen.getByText("33")).toBeInTheDocument();
    expect(screen.getByText("STANDBY")).toBeInTheDocument();
  });

  it("exposes Brand as a hub-free compound member", () => {
    // Renders without a provider — the wordmark needs no hub.
    const { container } = render(<TurntablePlayer.Brand />);
    expect(container.querySelector("[data-turntable-brand='true']")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Display-only deck: the knob and LED are pure indicators. Playback is driven by
// the playbutton/spacebar (the analyzer remote), and the deck reflects it.
// ---------------------------------------------------------------------------

/** Audio elements the engine drove (captured from `play()`'s `this`). */
const playedAudioElements: HTMLAudioElement[] = [];

/** Renders the hub deck plus the analyzer remote (its playbutton) under one provider. */
function renderHubDeck() {
  return render(
    <LocaleProvider initialLocale="en">
      <TurntablePlayerProvider previewUrl="/preview.mp3" trackTitle="Blue Train">
        <TurntablePlayer record={RECORD} swapKey="tp-test" />
        <TurntableAnalyzerSlot />
      </TurntablePlayerProvider>
    </LocaleProvider>,
  );
}

/** The display knob element (`data-turntable-speed-knob`). */
function knob(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>("[data-turntable-speed-knob='true']");
  if (!node) throw new Error("knob not found");
  return node;
}

/** The knob's indicator line, whose transform reflects the active angle. */
function indicator(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>("[data-turntable-speed-indicator='true']");
  if (!node) throw new Error("indicator not found");
  return node;
}

/** Power attribute the LED exposes (`on` / `standby`). */
function ledPower(container: HTMLElement): string | null {
  return container.querySelector("[data-turntable-led='true']")?.getAttribute("data-turntable-led-power") ?? null;
}

describe("TurntablePlayer deck reflects playback (display only)", () => {
  beforeEach(() => {
    playedAudioElements.length = 0;
    // jsdom has no WAAPI; stub it so the deck renders without throwing.
    HTMLElement.prototype.animate = vi.fn(() => ({
      cancel: vi.fn(),
      commitStyles: vi.fn(),
    })) as unknown as typeof HTMLElement.prototype.animate;
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLAudioElement) {
      playedAudioElements.push(this);
      return Promise.resolve();
    });
    vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the knob as a non-interactive indicator (no slider role, hidden from AT)", () => {
    const { container } = renderHubDeck();
    const dial = knob(container);
    expect(dial).not.toHaveAttribute("role", "slider");
    expect(dial).not.toHaveAttribute("tabindex");
    expect(dial).toHaveAttribute("aria-hidden", "true");
    // At rest the indicator points at the Standby caption angle.
    expect(indicator(container)).toHaveStyle({ transform: "translateY(-50%) rotate(150deg) translateZ(0)" });
    expect(ledPower(container)).toBe(TurntablePower.Standby);
  });

  it("the playbutton drives the deck: play lights the LED and points the knob at 33", async () => {
    const { container } = renderHubDeck();

    fireEvent.click(screen.getByRole("button", { name: "Play preview" }));
    await act(async () => {});

    expect(playedAudioElements.length).toBe(1);
    expect(indicator(container)).toHaveStyle({ transform: "translateY(-50%) rotate(210deg) translateZ(0)" });
    expect(ledPower(container)).toBe(TurntablePower.On);
  });

  it("pausing at the playbutton returns the knob to Standby and powers off", async () => {
    const { container } = renderHubDeck();

    fireEvent.click(screen.getByRole("button", { name: "Play preview" }));
    await act(async () => {});
    expect(ledPower(container)).toBe(TurntablePower.On);

    // The shared button is now a Pause control; clicking it pauses the deck.
    fireEvent.click(screen.getByRole("button", { name: "Pause preview" }));
    await act(async () => {});

    expect(indicator(container)).toHaveStyle({ transform: "translateY(-50%) rotate(150deg) translateZ(0)" });
    expect(ledPower(container)).toBe(TurntablePower.Standby);
  });
});
