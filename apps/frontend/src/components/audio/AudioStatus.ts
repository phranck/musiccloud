export const AudioStatus = {
  Loading: "loading",
  Ready: "ready",
  Playing: "playing",
  Paused: "paused",
  Ended: "ended",
  Unavailable: "unavailable",
} as const;

export type AudioStatus = (typeof AudioStatus)[keyof typeof AudioStatus];
