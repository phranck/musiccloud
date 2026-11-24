/**
 * The audio player's play-state machine: its phases, its actions, the reducer
 * that moves between them, the browser state names the controller compares
 * against, and the duration and progress rules read from an audio element.
 * Nothing here depends on React, so the transitions can be tested on their own.
 */

/**
 * The phases of the audio player's state machine.
 *
 * - `loading` waits for a lazy fetch to deliver a preview URL.
 * - `idle` is ready to play. Its duration defaults to 30s and is updated once metadata loads.
 * - `playing` means playback is active.
 * - `paused` means playback is paused.
 * - `error` means the audio URL is unplayable, and the component renders the unavailable state.
 * - `unavailable` means the backend confirmed that no preview can be produced for this track.
 */
export const PlayerPhase = {
  Loading: "loading",
  Idle: "idle",
  Playing: "playing",
  Paused: "paused",
  Error: "error",
  Unavailable: "unavailable",
} as const;

/**
 * The action types `playerReducer` accepts.
 *
 * - `URL_READY` moves `loading` to `idle` once a lazily fetched URL arrives.
 * - `URL_UNAVAILABLE` moves `loading` to `unavailable` when no URL can be produced.
 * - `METADATA_LOADED` stores the element's duration in `idle`, `playing` and `paused`.
 * - `PLAY` starts from `idle` at time 0 or resumes from `paused`.
 * - `PAUSE` moves `playing` to `paused`.
 * - `TIME_UPDATE` stores the current time and duration in `playing` and `paused`.
 * - `ENDED` returns `playing` to `idle` and keeps the duration.
 * - `ERROR` moves any phase to `error`.
 * - `SOURCE_CHANGED` resets any phase to a fresh `idle` track.
 */
export const PlayerActionType = {
  UrlReady: "URL_READY",
  UrlUnavailable: "URL_UNAVAILABLE",
  MetadataLoaded: "METADATA_LOADED",
  Play: "PLAY",
  Pause: "PAUSE",
  TimeUpdate: "TIME_UPDATE",
  Ended: "ENDED",
  Error: "ERROR",
  SourceChanged: "SOURCE_CHANGED",
} as const;

/**
 * The `AudioContext.state` values the controller compares against. `closed`
 * means the context is gone and must not be closed again, `running` means
 * the analyser receives samples, and `suspended` means the context needs a
 * `resume()`.
 */
export const AudioContextState = {
  Closed: "closed",
  Running: "running",
  Suspended: "suspended",
} as const;

/**
 * The MediaSession action names the controller registers handlers for. Both
 * `play` and `pause` are routed to the player's toggle.
 */
export const MediaSessionAction = {
  Play: "play",
  Pause: "pause",
} as const;

/**
 * The `navigator.mediaSession.playbackState` values the controller writes.
 * `playing` and `paused` are written while the player is active, and `none`
 * once it releases the OS media controls.
 */
export const MediaSessionPlaybackState = {
  Playing: "playing",
  Paused: "paused",
  None: "none",
} as const;

/**
 * The player's state per phase. `idle` holds the track duration in seconds.
 * `playing` and `paused` hold the current time and the duration in seconds.
 * `loading`, `error` and `unavailable` hold nothing else.
 */
export type PlayerState =
  | { phase: typeof PlayerPhase.Loading }
  | { phase: typeof PlayerPhase.Idle; duration: number }
  | { phase: typeof PlayerPhase.Playing; currentTime: number; duration: number }
  | { phase: typeof PlayerPhase.Paused; currentTime: number; duration: number }
  | { phase: typeof PlayerPhase.Error }
  | { phase: typeof PlayerPhase.Unavailable };

/**
 * An action dispatched to `playerReducer`. `METADATA_LOADED` holds the
 * duration in seconds, and `TIME_UPDATE` holds the current time and the
 * duration in seconds. {@link PlayerActionType} says what each one does.
 */
export type PlayerAction =
  | { type: typeof PlayerActionType.UrlReady }
  | { type: typeof PlayerActionType.UrlUnavailable }
  | { type: typeof PlayerActionType.MetadataLoaded; duration: number }
  | { type: typeof PlayerActionType.Play }
  | { type: typeof PlayerActionType.Pause }
  | { type: typeof PlayerActionType.TimeUpdate; currentTime: number; duration: number }
  | { type: typeof PlayerActionType.Ended }
  | { type: typeof PlayerActionType.Error }
  | { type: typeof PlayerActionType.SourceChanged };

/**
 * Computes the next player state for an action. An action that does not
 * apply to the current phase returns the state unchanged, so a late event
 * from the audio element never moves the player into a phase it cannot be in.
 *
 * @param state - The current player state.
 * @param action - The action to apply. {@link PlayerActionType} lists them.
 * @returns The next state, or `state` itself when the action does not apply.
 */
export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case PlayerActionType.UrlReady:
      if (state.phase === PlayerPhase.Loading) return { phase: PlayerPhase.Idle, duration: 30 };
      return state;
    case PlayerActionType.UrlUnavailable:
      if (state.phase === PlayerPhase.Loading) return { phase: PlayerPhase.Unavailable };
      return state;
    case PlayerActionType.MetadataLoaded:
      if (state.phase === PlayerPhase.Idle) return { ...state, duration: action.duration };
      if (state.phase === PlayerPhase.Playing || state.phase === PlayerPhase.Paused)
        return { ...state, duration: action.duration };
      return state;
    case PlayerActionType.Play:
      if (state.phase === PlayerPhase.Idle)
        return { phase: PlayerPhase.Playing, currentTime: 0, duration: state.duration };
      if (state.phase === PlayerPhase.Paused) return { ...state, phase: PlayerPhase.Playing };
      return state;
    case PlayerActionType.Pause:
      if (state.phase === PlayerPhase.Playing) return { ...state, phase: PlayerPhase.Paused };
      return state;
    case PlayerActionType.TimeUpdate:
      if (state.phase === PlayerPhase.Playing || state.phase === PlayerPhase.Paused)
        return { ...state, currentTime: action.currentTime, duration: action.duration };
      return state;
    case PlayerActionType.Ended:
      if (state.phase === PlayerPhase.Playing) return { phase: PlayerPhase.Idle, duration: state.duration };
      return state;
    case PlayerActionType.Error:
      return { phase: PlayerPhase.Error };
    case PlayerActionType.SourceChanged:
      // A new source (same-album track switch) resets to a fresh idle track;
      // metadata for the new src arrives via loadedmetadata.
      return { phase: PlayerPhase.Idle, duration: 30 };
    default:
      return state;
  }
}

/** Fallback track length when the element reports no usable duration (preview clips are ~30s). */
export const DEFAULT_DURATION_SECONDS = 30;

/**
 * Usable track length in seconds, falling back to {@link DEFAULT_DURATION_SECONDS}
 * when the element reports no finite, positive duration (metadata not loaded yet,
 * or a stream with no known length). Centralises the duration-or-default rule
 * shared by the progress, seek and metadata paths.
 *
 * @param audio - The audio element to read `duration` from.
 * @returns A positive, finite duration in seconds.
 */
export function resolveAudioDuration(audio: HTMLAudioElement): number {
  return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : DEFAULT_DURATION_SECONDS;
}

/**
 * The element's playback position as a share of its usable duration.
 *
 * @param audio - The audio element to read `currentTime` and `duration` from.
 * @returns A ratio clamped to `0 … 1`, or `0` when the division yields no finite number.
 */
export function resolveAudioProgressRatio(audio: HTMLAudioElement): number {
  const duration = resolveAudioDuration(audio);
  const ratio = audio.currentTime / duration;
  return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
}
