import { createContext, use } from "react";
import type { VinylSpinState as VinylSpinStateValue } from "@/components/vinyl/VinylRecord.types";

/**
 * The turntable's two display states.
 *
 * The deck runs at a single fixed speed (33⅓ RPM). This is not a user-selectable
 * setting — the knob is a pure indicator and the value is derived from the play
 * status: `Standby` while stopped (rotor idle, LED off, knob points at STANDBY),
 * `Rpm33` while playing (rotor spinning, LED on, knob points at 33). It drives the
 * deck optic only; it does not affect audio playback.
 *
 * Members are PascalCase to satisfy the project Doctor rule
 * `domain-literals/prefer-pascal-case-literal-namespaces`.
 */
export const TurntableSpeed = {
  /** Stopped: rotor idle and audio reset to the start. */
  Standby: "standby",
  /** 33⅓ RPM: the deck is playing. */
  Rpm33: "rpm33",
} as const;

/** A single {@link TurntableSpeed} value. */
export type TurntableSpeed = (typeof TurntableSpeed)[keyof typeof TurntableSpeed];

/**
 * Power state of the turntable, derived from the active {@link TurntableSpeed}.
 *
 * `On` while playing (`Rpm33`), `Standby` otherwise. The LED follows this value.
 * Kept as its own namespace (rather than reusing {@link TurntableSpeed}) so
 * consumers read the binary on/off intent directly instead of re-deriving it.
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
  /** Display speed derived from the play status (`rpm33` playing, else `standby`). */
  speed: TurntableSpeed;
  /** Power state derived from {@link speed} (`on` while playing). */
  power: TurntablePower;
  /** Visual spin state derived from the play phase (idle | playing | coasting). */
  spinState: VinylSpinStateValue;
  /** Toggles play/pause; the speed/power/spin state follows the play status. */
  togglePlay: () => void;
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
