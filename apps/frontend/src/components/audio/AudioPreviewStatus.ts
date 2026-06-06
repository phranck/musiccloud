export const AudioPreviewStatus = {
  Loading: "loading",
  Ready: "ready",
  Playing: "playing",
  Paused: "paused",
  Ended: "ended",
  Unavailable: "unavailable",
} as const;

export type AudioPreviewStatus = (typeof AudioPreviewStatus)[keyof typeof AudioPreviewStatus];
