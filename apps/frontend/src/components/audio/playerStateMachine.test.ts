import { describe, expect, it } from "vitest";
import {
  DEFAULT_DURATION_SECONDS,
  PlayerActionType,
  PlayerPhase,
  type PlayerState,
  playerReducer,
} from "@/components/audio/playerStateMachine";

/** Duration in seconds that a loaded track reports in these tests. */
const LOADED_DURATION_SECONDS = 29.5;
/** Playback position in seconds used for the playing and paused states. */
const CURRENT_TIME_SECONDS = 12;

/** A loading player waiting for its preview URL. */
const loading: PlayerState = { phase: PlayerPhase.Loading };
/** An idle player with a loaded duration. */
const idle: PlayerState = { phase: PlayerPhase.Idle, duration: LOADED_DURATION_SECONDS };
/** A playing player partway through its track. */
const playing: PlayerState = {
  phase: PlayerPhase.Playing,
  currentTime: CURRENT_TIME_SECONDS,
  duration: LOADED_DURATION_SECONDS,
};
/** A paused player partway through its track. */
const paused: PlayerState = {
  phase: PlayerPhase.Paused,
  currentTime: CURRENT_TIME_SECONDS,
  duration: LOADED_DURATION_SECONDS,
};

describe("playerReducer", () => {
  it("moves loading to idle with the default duration once the URL is ready", () => {
    expect(playerReducer(loading, { type: PlayerActionType.UrlReady })).toEqual({
      phase: PlayerPhase.Idle,
      duration: DEFAULT_DURATION_SECONDS,
    });
  });

  it("moves loading to unavailable when no URL can be produced", () => {
    expect(playerReducer(loading, { type: PlayerActionType.UrlUnavailable })).toEqual({
      phase: PlayerPhase.Unavailable,
    });
  });

  it("ignores URL actions outside the loading phase", () => {
    expect(playerReducer(playing, { type: PlayerActionType.UrlReady })).toBe(playing);
    expect(playerReducer(idle, { type: PlayerActionType.UrlUnavailable })).toBe(idle);
  });

  it("stores the loaded duration while idle, playing or paused, and not while loading", () => {
    const action = { type: PlayerActionType.MetadataLoaded, duration: DEFAULT_DURATION_SECONDS } as const;
    expect(playerReducer(idle, action)).toEqual({ phase: PlayerPhase.Idle, duration: DEFAULT_DURATION_SECONDS });
    expect(playerReducer(playing, action)).toEqual({ ...playing, duration: DEFAULT_DURATION_SECONDS });
    expect(playerReducer(paused, action)).toEqual({ ...paused, duration: DEFAULT_DURATION_SECONDS });
    expect(playerReducer(loading, action)).toBe(loading);
  });

  it("starts from idle at time zero and resumes from paused at the same position", () => {
    expect(playerReducer(idle, { type: PlayerActionType.Play })).toEqual({
      phase: PlayerPhase.Playing,
      currentTime: 0,
      duration: LOADED_DURATION_SECONDS,
    });
    expect(playerReducer(paused, { type: PlayerActionType.Play })).toEqual({ ...paused, phase: PlayerPhase.Playing });
    expect(playerReducer(loading, { type: PlayerActionType.Play })).toBe(loading);
  });

  it("pauses only a playing player", () => {
    expect(playerReducer(playing, { type: PlayerActionType.Pause })).toEqual({ ...playing, phase: PlayerPhase.Paused });
    expect(playerReducer(idle, { type: PlayerActionType.Pause })).toBe(idle);
  });

  it("updates the time only while playing or paused", () => {
    const action = {
      type: PlayerActionType.TimeUpdate,
      currentTime: CURRENT_TIME_SECONDS + 1,
      duration: LOADED_DURATION_SECONDS,
    } as const;
    expect(playerReducer(playing, action)).toEqual({ ...playing, currentTime: CURRENT_TIME_SECONDS + 1 });
    expect(playerReducer(paused, action)).toEqual({ ...paused, currentTime: CURRENT_TIME_SECONDS + 1 });
    expect(playerReducer(idle, action)).toBe(idle);
  });

  it("returns a playing player to idle at the end and keeps its duration", () => {
    expect(playerReducer(playing, { type: PlayerActionType.Ended })).toEqual(idle);
    expect(playerReducer(paused, { type: PlayerActionType.Ended })).toBe(paused);
  });

  it("moves any phase to error", () => {
    for (const state of [loading, idle, playing, paused]) {
      expect(playerReducer(state, { type: PlayerActionType.Error })).toEqual({ phase: PlayerPhase.Error });
    }
  });

  it("resets any phase to a fresh idle track when the source changes", () => {
    for (const state of [loading, playing, paused, { phase: PlayerPhase.Error } as const]) {
      expect(playerReducer(state, { type: PlayerActionType.SourceChanged })).toEqual({
        phase: PlayerPhase.Idle,
        duration: DEFAULT_DURATION_SECONDS,
      });
    }
  });
});
