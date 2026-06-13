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
  /** Subtle opacity entrance (was the `--animate-fade-in` keyframe, 0.25s). */
  FadeIn: 0.25,
  /** Row/tile entrance rise (was the `--animate-slide-up` keyframe, 0.6s). */
  SlideUp: 0.6,
  /** Clearing exit of the results panel (was the `--animate-slide-out-down` keyframe, 0.4s). */
  SlideOut: 0.4,
  /** Album-artwork cover swap in SongInfo (was the `.mc-cover-slide-*` classes, 900ms). */
  CoverSwap: 0.9,
  /**
   * Collapsible section open/close (was CollapsibleSection's 680ms
   * grid-template-rows transition). Numerically equal to {@link MotionDuration.Swap}
   * by coincidence — kept as its own member because retuning the content swap
   * must not change how sections collapse (independent semantics).
   */
  Collapse: 0.68,
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
  /**
   * Exact port of cubic-bezier(0.42, 0, 1, 1) — the CSS `ease-in` keyword.
   * Used by exits that accelerate away (was the `slide-out-down` keyframe's
   * timing function). Registered in `setup.ts` via `MC_IN_BEZIER`.
   */
  McIn: "mcIn",
  /**
   * Exact port of cubic-bezier(0, 0, 0.2, 1) — the gentle deceleration curve
   * the `fade-in` keyframe used (shared by the CSS-only `zoom-in` keyframe
   * that stays on the share page's bot path). Registered in `setup.ts` via
   * `MC_FADE_BEZIER`.
   */
  McFade: "mcFade",
} as const;
