import gsap from "gsap";
import { MotionDuration, MotionEase } from "./constants";
import { prefersReducedMotion, setupMotion } from "./setup";

/** Leftward distance of the first cover swipe. */
export const COVER_NUDGE_DISTANCE_PX = 84;

/** Leftward distance of the weaker second swipe. */
export const COVER_NUDGE_REPEAT_DISTANCE_PX = 42;

/**
 * Builds two fast leftward swipes with one smooth overshoot return after each one.
 * The stage transition is disabled while GSAP writes transforms so CSS easing cannot fight the motion.
 * Reduced motion writes no styles and returns null.
 */
export function buildCoverNudgeTimeline(stage: HTMLElement, onComplete?: () => void): gsap.core.Timeline | null {
  setupMotion();
  if (prefersReducedMotion()) return null;

  gsap.set(stage, { transition: "none" });
  const timeline = gsap.timeline({
    onComplete: () => {
      stopCoverNudge(stage);
      onComplete?.();
    },
  });
  timeline.to(stage, {
    x: -COVER_NUDGE_DISTANCE_PX,
    duration: MotionDuration.CoverNudgeSwipe,
    ease: MotionEase.CoverNudgeSwipe,
  });
  timeline.to(stage, { x: 0, duration: MotionDuration.CoverNudgeReturn, ease: MotionEase.CoverNudgeReturn });
  timeline.to(stage, {
    x: -COVER_NUDGE_REPEAT_DISTANCE_PX,
    duration: MotionDuration.CoverNudgeSwipe,
    ease: MotionEase.CoverNudgeSwipe,
  });
  timeline.to(stage, { x: 0, duration: MotionDuration.CoverNudgeReturn, ease: MotionEase.CoverNudgeReturn });
  return timeline;
}

/** Stops the current nudge and removes its inline transform and transition without changing the selected view. */
export function stopCoverNudge(stage: HTMLElement): void {
  gsap.killTweensOf(stage);
  gsap.set(stage, { clearProps: "transform,transition" });
}
