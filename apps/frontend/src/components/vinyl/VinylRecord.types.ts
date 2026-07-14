export const VinylSpinState = {
  Idle: "idle",
  Playing: "playing",
  Coasting: "coasting",
} as const;

export type VinylSpinState = (typeof VinylSpinState)[keyof typeof VinylSpinState];

export const VinylDiscFormat = {
  Lp: "lp",
  Single: "single",
} as const;

export type VinylDiscFormat = (typeof VinylDiscFormat)[keyof typeof VinylDiscFormat];

export const VinylLabelVariant = {
  Standard: "standard",
  Generic: "generic",
} as const;

export type VinylLabelVariant = (typeof VinylLabelVariant)[keyof typeof VinylLabelVariant];

/**
 * Coast wind-down window in milliseconds, shared by the two halves of the same
 * effect so they cannot drift apart:
 * - `VinylRecord` runs the rotor's coast (deceleration) animation for exactly
 *   this long.
 * - `TurntablePlayerProvider` waits exactly this long before settling the spin
 *   state from `Coasting` back to `Idle`.
 *
 * The settle timer must match the animation duration: fire it earlier and the
 * rotor snaps to idle mid-coast; fire it later and the rotor sits finished but
 * still flagged `Coasting`. Keeping one constant for both keeps the timings
 * locked together.
 */
export const LP_COAST_DURATION_MS = 2000;
