import { type ReactNode, useCallback, useEffect, useMemo, useReducer } from "react";
import type { AudioPlayerProps } from "@/components/audio/AudioPlayer";
import { useAudioController } from "@/components/audio/AudioPlayer";
import { AudioStatus, type AudioStatus as AudioStatusValue } from "@/components/audio/AudioStatus";
import {
  TurntablePlayerContext,
  type TurntablePlayerContextValue,
  TurntableSpeed,
  type TurntableSpeed as TurntableSpeedValue,
} from "@/components/turntable/TurntablePlayerContext";
import { derivePower, deriveSpinState } from "@/components/turntable/turntableState";
import { VinylSpinState, type VinylSpinState as VinylSpinStateValue } from "@/components/vinyl/VinylRecord.types";

/** Wind-down window after playback stops before the rotor returns to idle. */
const LP_COAST_DURATION_MS = 2000;

/** The engine props the hub forwards to {@link useAudioController}, plus children. */
interface TurntablePlayerProviderProps extends AudioPlayerProps {
  /** Compound parts (analyzer slot, platter, controls) rendered under the hub. */
  children: ReactNode;
}

/** Reducer-owned state: the selected speed plus the latest engine status. */
interface TurntableHubState {
  /** The selected turntable speed (also the source of the power state). */
  speed: TurntableSpeedValue;
  /** The visual spin state derived from playback transitions. */
  spinState: VinylSpinStateValue;
}

const TurntableHubActionType = {
  /** A synchronous playback start intent (before `audio.play()` resolves). */
  PlaybackIntentStarted: "playbackIntentStarted",
  /** A new engine status arrived (playing/paused/ended/unavailable/...). */
  EngineStatus: "engineStatus",
  /** The coast wind-down window elapsed; settle the rotor to idle. */
  CoastFinished: "coastFinished",
  /** The host selected a speed on the knob (start play or stop). */
  SpeedSet: "speedSet",
} as const;

type TurntableHubAction =
  | { type: typeof TurntableHubActionType.PlaybackIntentStarted }
  | { type: typeof TurntableHubActionType.EngineStatus; status: AudioStatusValue }
  | { type: typeof TurntableHubActionType.CoastFinished }
  | { type: typeof TurntableHubActionType.SpeedSet; speed: TurntableSpeedValue };

/**
 * Maps an engine audio status to the speed the hub should hold.
 *
 * `Playing` selects the default play speed; `Paused`, `Ended`, `Unavailable`
 * and the loading/ready phases settle on `Standby`. This keeps the knob and LED
 * in lock-step with the engine regardless of which control triggered the change.
 *
 * @param status - The latest engine audio status.
 * @returns The speed the hub should hold for that status.
 */
function speedForEngineStatus(status: AudioStatusValue): TurntableSpeedValue {
  return status === AudioStatus.Playing ? TurntableSpeed.Rpm33 : TurntableSpeed.Standby;
}

/**
 * Reduces the hub's speed and spin state.
 *
 * The spin derivation mirrors the logic that previously lived in
 * `ShareLayout.shareUiReducer`, now owned by the hub: a playback-start intent
 * spins immediately (before `audio.play()` resolves), the engine status drives
 * the steady-state spin via {@link deriveSpinState}, and the coast timer settles
 * a winding-down rotor back to idle.
 */
function turntableHubReducer(state: TurntableHubState, action: TurntableHubAction): TurntableHubState {
  switch (action.type) {
    case TurntableHubActionType.PlaybackIntentStarted:
      return { speed: TurntableSpeed.Rpm33, spinState: VinylSpinState.Playing };
    case TurntableHubActionType.EngineStatus:
      return {
        speed: speedForEngineStatus(action.status),
        spinState: deriveSpinState({ currentSpinState: state.spinState, status: action.status }),
      };
    case TurntableHubActionType.CoastFinished:
      if (state.spinState !== VinylSpinState.Coasting) return state;
      return { ...state, spinState: VinylSpinState.Idle };
    case TurntableHubActionType.SpeedSet:
      return { ...state, speed: action.speed };
  }
}

const INITIAL_HUB_STATE: TurntableHubState = {
  speed: TurntableSpeed.Standby,
  spinState: VinylSpinState.Idle,
};

/**
 * Owns the audio engine and the turntable speed/power/spin state, exposing them
 * as the {@link TurntablePlayerContextValue} hub.
 *
 * The engine (`useAudioController`) is lifted here from the former `AudioPlayer`
 * component: the provider routes the engine's intent/status/seek callbacks
 * through its own reducer so the speed, power LED and rotor spin stay in
 * lock-step with playback, then forwards the same signals to the host
 * (`onPlaybackIntent`/`onStatusChange`/`onSeekHint`) so `ShareLayout` can still
 * build its VFD status line.
 *
 * Speed/play synchronisation:
 * - Starting playback (any control) selects {@link TurntableSpeed.Rpm33}.
 * - Pause/end/unavailable settle on {@link TurntableSpeed.Standby}.
 * - {@link TurntablePlayerContextValue.setSpeed} to a playing speed starts
 *   playback if idle; to `Standby` it stops playback **and resets the position
 *   to the start** (`seekToStart`), so `Standby` is a stop, not a pause.
 *
 * All transport callbacks invoke the engine synchronously so the browser's
 * autoplay/`AudioContext.resume()` user-gesture activation is preserved.
 *
 * @param props - {@link TurntablePlayerProviderProps}.
 */
export function TurntablePlayerProvider({
  previewUrl,
  refreshShortId,
  mediaKind,
  trackTitle,
  onPlaybackIntent,
  onStatusChange,
  onSeekHint,
  children,
}: TurntablePlayerProviderProps) {
  const [hubState, dispatchHub] = useReducer(turntableHubReducer, INITIAL_HUB_STATE);

  // Bridge the engine's playback-start intent into the hub (spin + speed) and
  // forward it to the host for its own analytics/spin-status needs.
  const handleEnginePlaybackIntent = useCallback(() => {
    dispatchHub({ type: TurntableHubActionType.PlaybackIntentStarted });
    onPlaybackIntent?.();
  }, [onPlaybackIntent]);

  // Bridge engine status changes into the hub (speed/spin) and forward upward so
  // ShareLayout can build the VFD status line from the same signal.
  const handleEngineStatusChange = useCallback(
    (status: AudioStatusValue) => {
      dispatchHub({ type: TurntableHubActionType.EngineStatus, status });
      onStatusChange?.(status);
    },
    [onStatusChange],
  );

  const engine = useAudioController({
    previewUrl,
    refreshShortId,
    mediaKind,
    trackTitle,
    onPlaybackIntent: handleEnginePlaybackIntent,
    onStatusChange: handleEngineStatusChange,
    onSeekHint,
  });

  // Settle a winding-down rotor back to idle after the coast window, the same
  // 2s timer that previously lived in ShareLayout.
  useEffect(() => {
    if (hubState.spinState !== VinylSpinState.Coasting) return;
    const timeout = window.setTimeout(
      () => dispatchHub({ type: TurntableHubActionType.CoastFinished }),
      LP_COAST_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [hubState.spinState]);

  // Selects a speed. A playing speed starts playback when idle; `Standby` stops
  // playback (pause + reset to start). Engine calls stay synchronous so the
  // user-gesture activation survives for AudioContext.resume().
  const setSpeed = useCallback(
    (speed: TurntableSpeedValue) => {
      if (speed === TurntableSpeed.Standby) {
        if (engine.isPlaying) engine.togglePlay();
        // Standby is a stop, not a pause: rewind to the start so the next play
        // begins from the top (MC-071 design decision C).
        engine.seekToStart();
        dispatchHub({ type: TurntableHubActionType.SpeedSet, speed: TurntableSpeed.Standby });
        return;
      }
      if (!engine.isPlaying) engine.togglePlay();
      dispatchHub({ type: TurntableHubActionType.SpeedSet, speed });
    },
    [engine],
  );

  const value = useMemo<TurntablePlayerContextValue>(
    () => ({
      ariaLabel: engine.ariaLabel,
      isDisabled: engine.isDisabled,
      isLoading: engine.isLoading,
      isPlaying: engine.isPlaying,
      isUnavailable: engine.isUnavailable,
      mediaLabel: engine.mediaLabel,
      power: derivePower(hubState.speed),
      progressRatio: engine.progressRatio,
      seekBy: engine.seekBy,
      seekToNearEnd: engine.seekToNearEnd,
      seekToStart: engine.seekToStart,
      setSpeed,
      speed: hubState.speed,
      spinState: hubState.spinState,
      timeText: engine.timeText,
      title: engine.title,
      togglePlay: engine.togglePlay,
      trackTitle: engine.trackTitle,
    }),
    [engine, hubState.speed, hubState.spinState, setSpeed],
  );

  return <TurntablePlayerContext.Provider value={value}>{children}</TurntablePlayerContext.Provider>;
}
