import gsap from "gsap";
import { MotionDuration, MotionEase } from "./constants";
import { prefersReducedMotion, setupMotion } from "./setup";

/** Horizontal distance of the first cover excursion. */
export const COVER_NUDGE_DISTANCE_PX = 36;

/** Horizontal distance of the weaker second excursion. */
export const COVER_NUDGE_REPEAT_DISTANCE_PX = 18;

/**
 * Builds two spring-driven cover excursions with a complete return between them.
 * The stage transition is disabled while GSAP writes transforms so CSS easing cannot fight the spring.
 * Reduced motion writes no styles and returns null.
 */
export function buildCoverNudgeTimeline(stage: HTMLElement): gsap.core.Timeline | null {
  setupMotion();
  if (prefersReducedMotion()) return null;

  gsap.set(stage, { transition: "none" });
  const timeline = gsap.timeline({ onComplete: () => stopCoverNudge(stage) });
  timeline.to(stage, {
    x: -COVER_NUDGE_DISTANCE_PX,
    duration: MotionDuration.CoverNudge,
    ease: MotionEase.CoverNudge,
  });
  timeline.to(stage, { x: 0, duration: MotionDuration.CoverNudgeReturn, ease: MotionEase.CoverNudgeReturn });
  timeline.to(stage, {
    x: -COVER_NUDGE_REPEAT_DISTANCE_PX,
    duration: MotionDuration.CoverNudge,
    ease: MotionEase.CoverNudge,
  });
  timeline.to(stage, { x: 0, duration: MotionDuration.CoverNudgeReturn, ease: MotionEase.CoverNudgeReturn });
  return timeline;
}

/** Stops the current nudge and removes its inline transform and transition without changing the selected view. */
export function stopCoverNudge(stage: HTMLElement): void {
  gsap.killTweensOf(stage);
  gsap.set(stage, { clearProps: "transform,transition" });
}
