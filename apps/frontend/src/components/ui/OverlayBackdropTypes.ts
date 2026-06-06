export const OVERLAY_TRANSITION_MS = 300;

export const OverlayBackdropPlacement = {
  Absolute: "absolute",
  Fixed: "fixed",
} as const;

export type OverlayBackdropPlacement = (typeof OverlayBackdropPlacement)[keyof typeof OverlayBackdropPlacement];
