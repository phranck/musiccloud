export const VinylSpinState = {
  Idle: "idle",
  Playing: "playing",
  Coasting: "coasting",
} as const;

export type VinylSpinState = (typeof VinylSpinState)[keyof typeof VinylSpinState];
