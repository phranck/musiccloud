import { createContext, use } from "react";
import type { VinylSpinState as VinylSpinStateValue } from "@/components/vinyl/VinylRecord.types";

/**
 * Discrete turntable speed setting selected on the knob.
 *
 * The hub treats `Standby` as the stopped state (no rotation, audio reset to the
 * start) and `Rpm33`/`Rpm45` as the two playing speeds. Both playing members map
 * to a real rotor duration in {@link rotationDurationForSpeed} and a real audio
 * playback rate in {@link playbackRateForSpeed}: `Rpm45` speeds the audio up to
 * ~1.35x and, with `preservesPitch` off, raises its pitch with the tempo.
 *
 * Members are PascalCase to satisfy the project Doctor rule
 * `domain-literals/prefer-pascal-case-literal-namespaces`.
 */
export const TurntableSpeed = {
  /** Stopped: rotor idle and audio reset to the start. */
  Standby: "standby",
  /** 33⅓ RPM playing speed (the default play speed). */
  Rpm33: "rpm33",
  /** 45 RPM playing speed (the faster rotor tempo). */
  Rpm45: "rpm45",
} as const;

/** A single {@link TurntableSpeed} value. */
export type TurntableSpeed = (typeof TurntableSpeed)[keyof typeof TurntableSpeed];

/**
 * Power state of the turntable, derived from the active {@link TurntableSpeed}.
 *
 * `On` whenever a playing speed (`Rpm33`/`Rpm45`) is selected, `Standby`
 * otherwise. The LED follows this value. Kept as its own namespace (rather than
 * reusing {@link TurntableSpeed}) so consumers read the binary on/off intent
 * directly instead of re-deriving it.
 *
 * Members are PascalCase to satisfy the project Doctor rule
 * `domain-literals/prefer-pascal-case-literal-namespaces`.
 */
export const TurntablePower = {
  /** A playing speed is selected; the LED is lit. */
  On: "on",
  /** Stopped; the LED is off. */
  Standby: "standby",
} as const;

/** A single {@link TurntablePower} value. */
export type TurntablePower = (typeof TurntablePower)[keyof typeof TurntablePower];

/**
 * The value exposed by the TurntablePlayer hub.
 *
 * The hub owns the audio engine (`useAudioController`) plus the speed/power
 * state and exposes a flat view-model so the peripheral parts — knob, LED,
 * playbutton, analyzer and platter — all read from one source. The transport
 * callbacks must be invoked synchronously inside a user-gesture handler so the
 * browser's autoplay/`AudioContext.resume()` activation is preserved.
 */
export interface TurntablePlayerContextValue {
  /** Whether the engine is currently playing. */
  isPlaying: boolean;
  /** Whether playback controls are disabled (no preview / unavailable). */
  isDisabled: boolean;
  /** Whether the engine is still loading its source. */
  isLoading: boolean;
  /** Whether the track has no playable preview at all. */
  isUnavailable: boolean;
  /** Pre-formatted elapsed/remaining time string for the analyzer display. */
  timeText: string;
  /** Playback progress in the `[0, 1]` range. */
  progressRatio: number;
  /** Accessible label describing the current transport action. */
  ariaLabel: string;
  /** Optional native `title` tooltip for the transport control. */
  title?: string;
  /** Human-readable media kind label (e.g. "preview" / "song"). */
  mediaLabel: string;
  /** The current track title. */
  trackTitle: string;
  /** Currently selected speed (`standby` | `rpm33` | `rpm45`). */
  speed: TurntableSpeed;
  /** Power state derived from {@link speed} (`on` at a playing speed). */
  power: TurntablePower;
  /** Visual spin state derived from the play phase (idle | playing | coasting). */
  spinState: VinylSpinStateValue;
  /** Toggles play/pause, keeping the speed/power state consistent. */
  togglePlay: () => void;
  /**
   * Selects a speed. Moving to a playing speed starts playback; moving to
   * `Standby` stops playback and resets the position to the start.
   */
  setSpeed: (speed: TurntableSpeed) => void;
  /** Seeks by a relative number of seconds (negative rewinds). */
  seekBy: (deltaSeconds: number) => void;
  /** Seeks to the very start of the track. */
  seekToStart: () => void;
  /** Seeks to just before the end of the track. */
  seekToNearEnd: () => void;
}

/**
 * Context carrying the {@link TurntablePlayerContextValue}.
 *
 * `null` is the out-of-provider default so {@link useTurntablePlayer} can throw
 * a clear error instead of handing back a partially-defined value.
 */
const TurntablePlayerContext = createContext<TurntablePlayerContextValue | null>(null);

/**
 * Reads the TurntablePlayer hub value from context.
 *
 * Throws when called outside a `TurntablePlayerProvider`, mirroring the
 * `usePlayerContext` guard in `PlayerParts.tsx`, so a misplaced consumer fails
 * loudly at render time rather than dereferencing a missing hub.
 *
 * @returns The current {@link TurntablePlayerContextValue}.
 */
export function useTurntablePlayer(): TurntablePlayerContextValue {
  const ctx = use(TurntablePlayerContext);
  if (!ctx) throw new Error("TurntablePlayer compound components must be rendered inside <TurntablePlayerProvider>.");
  return ctx;
}

export { TurntablePlayerContext };
