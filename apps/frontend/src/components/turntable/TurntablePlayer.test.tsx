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

    // The hub-driven Control renders the interactive knob: same Rpm33 angle as
    // the former decorative indicator, plus the GPU compositor-layer hint.
    expect(container.querySelector("[data-turntable-speed-indicator='true']")).toHaveStyle({
      transform: "translateY(-50%) rotate(-150deg) translateZ(0)",
      transformOrigin: "0% 50%",
    });

    rerender(
      <StubHubProvider speed={TurntableSpeed.Rpm45} spinState={VinylSpinState.Playing}>
        <TurntablePlayer.Control />
      </StubHubProvider>,
    );

    expect(container.querySelector("[data-turntable-speed-indicator='true']")).toHaveStyle({
      transform: "translateY(-50%) rotate(-120deg) translateZ(0)",
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
    // Control.Knob is the decorative knob: plain transform, no GPU layer hint.
    expect(container.querySelector("[data-turntable-speed-indicator='true']")).toHaveStyle({
      transform: "translateY(-50%) rotate(-120deg)",
    });
    expect(screen.getByText("33")).toBeInTheDocument();
    expect(screen.getByText("STANDBY")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Interactive knob (Unit 4): the real hub provider + mocked audio engine, so a
// knob drag and the playbutton drive the SAME shared playback state end-to-end.
// ---------------------------------------------------------------------------

/** Audio elements the engine drove (captured from `play()`'s `this`). */
const playedAudioElements: HTMLAudioElement[] = [];
/** Count of `currentTime = 0` writes — the seekToStart in the Standby stop. */
let seekToStartCalls = 0;
let originalCurrentTime: PropertyDescriptor | undefined;

/** Renders the hub deck (and optionally the analyzer remote) under one provider. */
function renderHubDeck(extra?: ReactNode) {
  return render(
    <LocaleProvider initialLocale="en">
      <TurntablePlayerProvider previewUrl="/preview.mp3" trackTitle="Blue Train">
        <TurntablePlayer record={RECORD} />
        {extra}
      </TurntablePlayerProvider>
    </LocaleProvider>,
  );
}

/** The interactive knob element (the `role="slider"` dial). */
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

const KNOB_CENTER = { x: 100, y: 100 };
const KNOB_RADIUS = 50;

/**
 * Drags the knob from its centre to the point at `angleDeg` (CSS convention) and
 * releases. The knob's `getBoundingClientRect` is stubbed to a fixed box centred
 * on {@link KNOB_CENTER} so the angle math is deterministic in jsdom.
 *
 * Each pointer event is dispatched in its own `act` so the `drag` state from the
 * press is flushed before the move reads it; a trailing async `act` drains the
 * `audio.play()` promise so the resulting status dispatch is wrapped too.
 *
 * @param container - The render container holding the knob.
 * @param angleDeg - Target drag angle in degrees.
 */
async function dragKnobToAngle(container: HTMLElement, angleDeg: number) {
  const dial = knob(container);
  dial.getBoundingClientRect = () =>
    ({
      bottom: KNOB_CENTER.y + KNOB_RADIUS,
      height: KNOB_RADIUS * 2,
      left: KNOB_CENTER.x - KNOB_RADIUS,
      right: KNOB_CENTER.x + KNOB_RADIUS,
      toJSON: () => ({}),
      top: KNOB_CENTER.y - KNOB_RADIUS,
      width: KNOB_RADIUS * 2,
      x: KNOB_CENTER.x - KNOB_RADIUS,
      y: KNOB_CENTER.y - KNOB_RADIUS,
    }) as DOMRect;

  const radians = (angleDeg * Math.PI) / 180;
  const targetX = KNOB_CENTER.x + Math.cos(radians) * KNOB_RADIUS;
  const targetY = KNOB_CENTER.y + Math.sin(radians) * KNOB_RADIUS;
  const pointer = { button: 0, pointerId: 1, pointerType: "mouse" };

  fireEvent.pointerDown(dial, { ...pointer, clientX: KNOB_CENTER.x, clientY: KNOB_CENTER.y });
  fireEvent.pointerMove(dial, { ...pointer, clientX: targetX, clientY: targetY });
  fireEvent.pointerUp(dial, { ...pointer, clientX: targetX, clientY: targetY });
  // Drain the play() promise so its onStatusChange dispatch runs inside act.
  await act(async () => {});
}

describe("TurntablePlayer interactive knob", () => {
  beforeEach(() => {
    playedAudioElements.length = 0;
    seekToStartCalls = 0;
    // jsdom has no WAAPI and no pointer capture; stub both so the deck renders
    // and the drag handlers run without throwing.
    HTMLElement.prototype.animate = vi.fn(() => ({
      cancel: vi.fn(),
      commitStyles: vi.fn(),
    })) as unknown as typeof HTMLElement.prototype.animate;
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);

    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLAudioElement) {
      playedAudioElements.push(this);
      return Promise.resolve();
    });
    vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    originalCurrentTime = Object.getOwnPropertyDescriptor(window.HTMLMediaElement.prototype, "currentTime");
    Object.defineProperty(window.HTMLMediaElement.prototype, "currentTime", {
      configurable: true,
      get() {
        return 0;
      },
      set(value: number) {
        if (value === 0) seekToStartCalls += 1;
      },
    });
  });

  afterEach(() => {
    cleanup();
    if (originalCurrentTime) {
      Object.defineProperty(window.HTMLMediaElement.prototype, "currentTime", originalCurrentTime);
    }
  });

  it("renders the knob as a slider with the resting Standby value", () => {
    const { container } = renderHubDeck();
    const dial = knob(container);
    expect(dial).toHaveAttribute("role", "slider");
    expect(dial).toHaveAttribute("tabindex", "0");
    expect(dial).toHaveAttribute("aria-valuetext", "Standby");
    // At rest the indicator points at the Standby caption angle.
    expect(indicator(container)).toHaveStyle({ transform: "translateY(-50%) rotate(150deg) translateZ(0)" });
    expect(ledPower(container)).toBe(TurntablePower.Standby);
  });

  it("dragging to the 45 angle starts playback at Rpm45 and lights the LED", async () => {
    const { container } = renderHubDeck();

    // -120deg snaps to Rpm45 (SPEED_KNOB_ANGLE_DEG.Rpm45).
    await dragKnobToAngle(container, -120);

    expect(playedAudioElements.length).toBe(1);
    expect(knob(container)).toHaveAttribute("aria-valuetext", "45 RPM");
    expect(indicator(container)).toHaveStyle({ transform: "translateY(-50%) rotate(-120deg) translateZ(0)" });
    expect(ledPower(container)).toBe(TurntablePower.On);
  });

  it("dragging to the Standby angle stops, rewinds to start, and powers off", async () => {
    const { container } = renderHubDeck();

    // Start playing first (drag to the 33 angle).
    await dragKnobToAngle(container, -150);
    expect(playedAudioElements.length).toBe(1);
    expect(ledPower(container)).toBe(TurntablePower.On);

    const pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, "pause");
    const seekBefore = seekToStartCalls;

    // 150deg snaps to Standby: a stop (pause + seekToStart), not a pause.
    await dragKnobToAngle(container, 150);

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(seekToStartCalls).toBeGreaterThan(seekBefore);
    expect(knob(container)).toHaveAttribute("aria-valuetext", "Standby");
    expect(ledPower(container)).toBe(TurntablePower.Standby);
  });

  it("a tap with no movement does not change the speed (pure drag semantics)", async () => {
    const { container } = renderHubDeck();
    const dial = knob(container);
    const pointer = { button: 0, clientX: KNOB_CENTER.x, clientY: KNOB_CENTER.y, pointerId: 1, pointerType: "mouse" };

    fireEvent.pointerDown(dial, pointer);
    fireEvent.pointerUp(dial, pointer);
    await act(async () => {});

    expect(playedAudioElements.length).toBe(0);
    expect(knob(container)).toHaveAttribute("aria-valuetext", "Standby");
    expect(ledPower(container)).toBe(TurntablePower.Standby);
  });

  it("arrow keys step the speed without leaking to the global audio router", async () => {
    const { container } = renderHubDeck();
    const dial = knob(container);

    // ArrowUp from Standby -> Rpm33 starts playback.
    fireEvent.keyDown(dial, { key: "ArrowUp" });
    await act(async () => {});
    expect(playedAudioElements.length).toBe(1);
    expect(knob(container)).toHaveAttribute("aria-valuetext", "33 RPM");

    // ArrowUp again -> Rpm45.
    fireEvent.keyDown(dial, { key: "ArrowUp" });
    await act(async () => {});
    expect(knob(container)).toHaveAttribute("aria-valuetext", "45 RPM");

    // ArrowDown twice -> back to Standby (stop).
    fireEvent.keyDown(dial, { key: "ArrowDown" });
    await act(async () => {});
    fireEvent.keyDown(dial, { key: "ArrowDown" });
    await act(async () => {});
    expect(knob(container)).toHaveAttribute("aria-valuetext", "Standby");
  });

  it("the playbutton and the knob drive the same hub state", async () => {
    const { container } = renderHubDeck(<TurntableAnalyzerSlot />);

    // Start via the analyzer remote's playbutton (default play speed Rpm33).
    fireEvent.click(screen.getByRole("button", { name: "Play preview" }));
    await act(async () => {});

    // The knob and LED follow the same hub: Rpm33 + power On.
    expect(playedAudioElements.length).toBe(1);
    expect(knob(container)).toHaveAttribute("aria-valuetext", "33 RPM");
    expect(indicator(container)).toHaveStyle({ transform: "translateY(-50%) rotate(-150deg) translateZ(0)" });
    expect(ledPower(container)).toBe(TurntablePower.On);

    // Stopping at the knob (drag to Standby) flips the shared playbutton to "Play".
    await dragKnobToAngle(container, 150);
    expect(screen.getByRole("button", { name: "Play preview" })).toBeInTheDocument();
    expect(ledPower(container)).toBe(TurntablePower.Standby);
  });
});
