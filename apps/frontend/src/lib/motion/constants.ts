/**
 * Central motion timing constants for all GSAP-driven animations.
 * Single source of truth — never inline durations or easing strings
 * in components (DRY + domain-literals rule).
 */
export const MotionDuration = {
  /** Content swap between app states (was SmoothSwap 680ms). */
  Swap: 0.68,
  /** Platform grid FLIP reflow (was GRID_ANIMATION_MS 620ms). */
  Grid: 0.62,
  /** Search field return FLIP (was useFlipAnimation 620ms). */
  FlipReturn: 0.62,
  /** Page-out portion of a route transition. */
  PageOut: 0.28,
  /** Page-in portion of a route transition. */
  PageIn: 0.5,
} as const;

export const MotionEase = {
  /**
   * Exact port of the app-wide cubic-bezier(0.16, 1, 0.3, 1).
   *
   * This is only the registered ease *name*. The matching bezier control
   * points live in `setup.ts` as `MC_OUT_BEZIER` and are registered with
   * GSAP via `CustomEase.create(MotionEase.McOut, MC_OUT_BEZIER)`.
   */
  McOut: "mcOut",
} as const;
