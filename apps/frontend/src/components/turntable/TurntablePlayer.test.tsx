import { render, screen } from "@testing-library/react";
import { type ReactNode, useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TurntablePlayer } from "@/components/turntable/TurntablePlayer";
import {
  TurntablePlayerContext,
  type TurntablePlayerContextValue,
  TurntablePower,
  TurntableSpeed,
  type TurntableSpeed as TurntableSpeedValue,
} from "@/components/turntable/TurntablePlayerContext";
import { derivePower } from "@/components/turntable/turntableState";
import { VinylSpinState, type VinylSpinState as VinylSpinStateValue } from "@/components/vinyl/VinylRecord.types";

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
      progressRatio: 0,
      seekBy: noop,
      seekToNearEnd: noop,
      seekToStart: noop,
      setSpeed: noop,
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

describe("TurntablePlayer compound", () => {
  it("renders the LED, platter, control and static knob labels", () => {
    const { container } = render(
      <StubHubProvider speed={TurntableSpeed.Rpm33} spinState={VinylSpinState.Playing}>
        <TurntablePlayer record={RECORD} />
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

    // The static speed captions are part of the control cluster.
    expect(screen.getByText("33")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("ON")).toBeInTheDocument();
    expect(screen.getByText("STANDBY")).toBeInTheDocument();
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

  it("points the knob indicator at the active speed angle", () => {
    const { container, rerender } = render(
      <StubHubProvider speed={TurntableSpeed.Rpm33} spinState={VinylSpinState.Playing}>
        <TurntablePlayer.Control />
      </StubHubProvider>,
    );

    // Rpm33 reproduces the former static decorative indicator angle exactly.
    expect(container.querySelector("[data-turntable-speed-indicator='true']")).toHaveStyle({
      transform: "translateY(-50%) rotate(-150deg)",
      transformOrigin: "0% 50%",
    });

    rerender(
      <StubHubProvider speed={TurntableSpeed.Rpm45} spinState={VinylSpinState.Playing}>
        <TurntablePlayer.Control />
      </StubHubProvider>,
    );

    expect(container.querySelector("[data-turntable-speed-indicator='true']")).toHaveStyle({
      transform: "translateY(-50%) rotate(-120deg)",
    });
  });

  it("forwards the hub spin state to the embedded vinyl record", () => {
    render(
      <StubHubProvider speed={TurntableSpeed.Rpm33} spinState={VinylSpinState.Coasting}>
        <TurntablePlayer.Platter record={RECORD} />
      </StubHubProvider>,
    );

    expect(screen.getByLabelText("Vinyl record for Blue Train")).toHaveAttribute(
      "data-spin-state",
      VinylSpinState.Coasting,
    );
  });

  it("drives the rotor revolution duration from the hub speed (45 RPM is faster)", () => {
    const cancel = vi.fn();
    const commitStyles = vi.fn();
    const animate = vi.fn(() => ({ cancel, commitStyles })) as unknown as typeof HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate;

    const { rerender } = render(
      <StubHubProvider speed={TurntableSpeed.Rpm33} spinState={VinylSpinState.Playing}>
        <TurntablePlayer.Platter record={RECORD} />
      </StubHubProvider>,
    );

    // Rpm33 spins at the default 1800 ms revolution.
    expect(animate).toHaveBeenLastCalledWith(expect.anything(), {
      duration: 1800,
      easing: "linear",
      iterations: Infinity,
    });

    rerender(
      <StubHubProvider speed={TurntableSpeed.Rpm45} spinState={VinylSpinState.Playing}>
        <TurntablePlayer.Platter record={RECORD} />
      </StubHubProvider>,
    );

    // Rpm45 picks the faster 1333 ms revolution.
    expect(animate).toHaveBeenLastCalledWith(expect.anything(), {
      duration: 1333,
      easing: "linear",
      iterations: Infinity,
    });
  });

  it("exposes Control.Knob and Control.KnobLabels as compound members", () => {
    const { container } = render(
      <>
        <TurntablePlayer.Control.Knob speed={TurntableSpeed.Rpm45} />
        <TurntablePlayer.Control.KnobLabels />
      </>,
    );

    expect(container.querySelector("[data-turntable-speed-knob='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-turntable-speed-indicator='true']")).toHaveStyle({
      transform: "translateY(-50%) rotate(-120deg)",
    });
    expect(screen.getByText("33")).toBeInTheDocument();
    expect(screen.getByText("STANDBY")).toBeInTheDocument();
  });
});
