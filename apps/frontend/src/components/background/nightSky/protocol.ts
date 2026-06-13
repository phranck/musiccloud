import type { NightSkySettings } from "./settings";

/**
 * Typed message protocol between the main-thread bridge
 * (`BackgroundScene.tsx`) and the render worker (`worker.ts`). Payloads are
 * small primitives only — nothing is transferred per frame (plan MC-029
 * policy 6); the single exception is the one-time OffscreenCanvas transfer
 * in {@link InitMessage}.
 */

/** Discriminants of every bridge→worker message. */
export const NightSkyMessageType = {
  /** One-time setup: canvas transfer + initial sizing + settings. */
  Init: "init",
  /** CSS size or device pixel ratio changed (throttled by the bridge). */
  Resize: "resize",
  /** Tab visibility changed; hidden pauses the loop entirely. */
  Visibility: "visibility",
  /** OS reduced-motion preference changed. */
  ReducedMotion: "reducedMotion",
  /** Set (or fade to) a new day amount. */
  SetDayness: "setDayness",
  /** Master animation switch (off = still image, zero GPU work). */
  SetAnimate: "setAnimate",
  /** Runtime switch of the local-clock automatic (plan MC-030). */
  SetAutoDayNight: "setAutoDayNight",
} as const;

/** Discriminants of every worker→bridge message. */
export const NightSkyWorkerEvent = {
  /** First frame has been rendered — the bridge may fade the canvas in. */
  Ready: "ready",
  /** WebGL2 unavailable or context lost — the bridge keeps the CSS fallback. */
  Failed: "failed",
} as const;

/** One-time setup message; `canvas` must be listed in the transfer array. */
export interface InitMessage {
  type: typeof NightSkyMessageType.Init;
  canvas: OffscreenCanvas;
  cssWidth: number;
  cssHeight: number;
  pixelRatio: number;
  reducedMotion: boolean;
  settings: NightSkySettings;
}

/** Viewport/DPR update. */
export interface ResizeMessage {
  type: typeof NightSkyMessageType.Resize;
  cssWidth: number;
  cssHeight: number;
  pixelRatio: number;
}

/** Tab visibility update. */
export interface VisibilityMessage {
  type: typeof NightSkyMessageType.Visibility;
  visible: boolean;
}

/** Reduced-motion preference update. */
export interface ReducedMotionMessage {
  type: typeof NightSkyMessageType.ReducedMotion;
  reduced: boolean;
}

/** Day-amount update; `animated` plays the boosted fade, otherwise it snaps. */
export interface SetDaynessMessage {
  type: typeof NightSkyMessageType.SetDayness;
  dayness: number;
  animated: boolean;
}

/** Master animation switch. */
export interface SetAnimateMessage {
  type: typeof NightSkyMessageType.SetAnimate;
  animate: boolean;
}

/**
 * Local-clock automatic on/off. No hour payload: `sunriseHour`,
 * `sunsetHour` and `twilightHours` already live in the worker's settings
 * object since {@link InitMessage}.
 */
export interface SetAutoDayNightMessage {
  type: typeof NightSkyMessageType.SetAutoDayNight;
  enabled: boolean;
}

/** Union of every message the worker consumes. */
export type NightSkyMessage =
  | InitMessage
  | ResizeMessage
  | VisibilityMessage
  | ReducedMotionMessage
  | SetDaynessMessage
  | SetAnimateMessage
  | SetAutoDayNightMessage;

/** Union of every event the worker emits back to the bridge. */
export interface NightSkyWorkerEventMessage {
  type: (typeof NightSkyWorkerEvent)[keyof typeof NightSkyWorkerEvent];
}
