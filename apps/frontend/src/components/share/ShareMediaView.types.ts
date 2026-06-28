export const ShareMediaView = {
  Cover: "cover",
  Turntable: "turntable",
} as const;

export type ShareMediaView = (typeof ShareMediaView)[keyof typeof ShareMediaView];
