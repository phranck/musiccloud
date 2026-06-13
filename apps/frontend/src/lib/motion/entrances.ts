import gsap from "gsap";
import { MotionDuration, MotionEase } from "./constants";
import { prefersReducedMotion, setupMotion } from "./setup";

/**
 * One-shot enter/exit tween factories — the GSAP ports of the retired
 * interaction-flow CSS keyframes (`fade-in`, `slide-up`, `slide-out-down`).
 * Every consumer fires post-hydration on a user interaction; the share page's
 * bot/no-JS enter animations (`zoom-in`, `slide-down-in`, `slide-up-in`, the
 * Astro `slide-up` usages) intentionally stay CSS — see
 * `styles/animations.css` for the exception inventory.
 *
 * Keyframe parity: durations, easing curves and transform values are exact
 * ports of the removed CSS (`MotionDuration`/`MotionEase` carry the values;
 * the per-factory constants below carry the transforms). Nothing is
 * "improved" — look-and-feel parity is the migration contract (plan MC-029).
 *
 * Reduced motion: every factory performs a one-shot `prefersReducedMotion()`
 * read at trigger time and returns `null` without writing styles (the CSS
 * reduced-motion rule in `animations.css` does not cover JS tweens — this
 * gate is the only guard). For entrances, skipping IS the instant end state:
 * the DOM already shows the final layout. {@link animateSlideOutDown} is the
 * exception: its caller drives a state machine from the completion callback,
 * so on `null` the caller MUST invoke that callback itself.
 *
 * Cleanup contract: entrance tweens `clearProps` their inline styles on
 * natural completion (no residue on settled elements, same convention as
 * `lib/motion/swap.ts`). The exit tween keeps its end state inline — the
 * element is about to be unmounted by the completion callback's state change,
 * and clearing first would flash it back to full opacity for a frame.
 *
 * Setup contract: every export calls `setupMotion()` first (tree-shaking
 * safety, see `setup.ts`).
 */

/** Start vars of the fade entrance — exact port of the `fade-in` keyframe. */
const FADE_IN_FROM_VARS: gsap.TweenVars = { opacity: 0 };

/**
 * Start vars of the rise entrance — exact port of the `slide-up` keyframe
 * (`opacity: 0; transform: translateY(12px) scale(0.97)`).
 */
const SLIDE_UP_FROM_VARS: gsap.TweenVars = { opacity: 0, y: 12, scale: 0.97 };

/**
 * End vars of the clearing exit — exact port of the `slide-out-down` keyframe
 * (`opacity: 0; transform: translateY(40px) scale(0.95)`, CSS `ease-in`).
 */
const SLIDE_OUT_DOWN_TO_VARS: gsap.TweenVars = { opacity: 0, y: 40, scale: 0.95 };

/** Options for {@link animateSlideUp}. Only knobs with a concrete consumer exist (YAGNI). */
interface SlideUpOptions {
  /**
   * Start delay in seconds for a single element. Used by row components that
   * own their position in a list (e.g. `GenreRowButton`, which computes its
   * capped per-index delay itself). Mutually exclusive with the stagger
   * options in practice — batch consumers pass a stagger, single-element
   * consumers pass a delay.
   */
  delaySeconds?: number;
  /**
   * Per-element stagger in seconds when `targets` is a collection — element
   * `i` starts at `i * staggerEachSeconds` (the GSAP equivalent of the
   * per-element `animation-delay` the CSS consumers used). Suited for SMALL
   * collections only (the disambiguation panel animates ≤ 8 cards): tween
   * init reads computed styles per target, which forced-reflows when many
   * targets mount in one commit — large batches (the ~250-tile genre grid)
   * stay on the CSS `animate-slide-up` entrance instead (MC-029 Phase-2-gate
   * finding).
   */
  staggerEachSeconds?: number;
}

/** Options for {@link animateSlideOutDown}. */
interface SlideOutDownOptions {
  /**
   * Called exactly once when the exit finishes (GSAP `onComplete` — fires
   * once per tween, no event bubbling to guard against). Drives the caller's
   * post-exit state change (e.g. the landing page's clear choreography).
   * NOT called when the tween is killed or when the factory returns `null`
   * (reduced motion) — on `null` the caller must invoke it synchronously,
   * because the flow it drives must not depend on an animation playing.
   */
  onComplete: () => void;
}

/**
 * Plays the subtle opacity entrance on `targets` — the GSAP port of the
 * removed `animate-fade-in` Tailwind class (0.25s, gentle deceleration).
 * Call it from a pre-paint effect (`useGSAP` layout phase) so the start value
 * is applied before the mount commit's first paint, exactly like the CSS
 * animation's `both` fill did.
 *
 * @param targets - The entering element(s).
 * @returns The entrance tween, or `null` when the user prefers reduced motion
 *   or `targets` resolves to no elements.
 */
export function animateFadeIn(targets: gsap.DOMTarget): gsap.core.Tween | null {
  setupMotion();
  if (prefersReducedMotion()) return null;
  if (gsap.utils.toArray(targets).length === 0) return null;
  return gsap.fromTo(targets, FADE_IN_FROM_VARS, {
    opacity: 1,
    duration: MotionDuration.FadeIn,
    ease: MotionEase.McFade,
    clearProps: "opacity",
  });
}

/**
 * Plays the rise entrance on `targets` — the GSAP port of the removed
 * `animate-slide-up` Tailwind class (0.6s, `mcOut`, translateY(12px) +
 * scale(0.97) into place). Supports the two delay shapes its CSS consumers
 * used: a fixed per-element delay and an indexed stagger with optional cap
 * (see {@link SlideUpOptions}).
 *
 * Like the CSS `both` fill, all targets snap to the hidden start state
 * immediately (GSAP `fromTo` renders the from-vars on creation), so staggered
 * elements do not flash visible before their turn.
 *
 * @param targets - The entering element(s) (single element or collection).
 * @param options - Delay/stagger knobs (see {@link SlideUpOptions}).
 * @returns The entrance tween, or `null` when the user prefers reduced motion
 *   or `targets` resolves to no elements.
 */
export function animateSlideUp(targets: gsap.DOMTarget, options: SlideUpOptions = {}): gsap.core.Tween | null {
  setupMotion();
  if (prefersReducedMotion()) return null;
  if (gsap.utils.toArray(targets).length === 0) return null;
  const { delaySeconds = 0, staggerEachSeconds = 0 } = options;
  return gsap.fromTo(targets, SLIDE_UP_FROM_VARS, {
    opacity: 1,
    y: 0,
    scale: 1,
    duration: MotionDuration.SlideUp,
    ease: MotionEase.McOut,
    delay: delaySeconds,
    stagger: staggerEachSeconds,
    clearProps: "opacity,transform",
  });
}

/**
 * Plays the clearing exit on `target` — the GSAP port of the removed
 * `animate-slide-out-down` Tailwind class (0.4s, CSS `ease-in`, drop 40px +
 * shrink to 0.95 while fading out). The element keeps its hidden end state
 * inline afterwards (no `clearProps`): the completion callback unmounts it
 * via a state change, and clearing first would flash the old content.
 *
 * @param target - The exiting element.
 * @param options - Completion wiring (see {@link SlideOutDownOptions}).
 * @returns The exit tween, or `null` when the user prefers reduced motion or
 *   `target` resolves to no element — the caller must then run
 *   `options.onComplete` itself (the post-exit flow must not die with the
 *   animation).
 */
export function animateSlideOutDown(target: gsap.DOMTarget, options: SlideOutDownOptions): gsap.core.Tween | null {
  setupMotion();
  if (prefersReducedMotion()) return null;
  if (gsap.utils.toArray(target).length === 0) return null;
  return gsap.to(target, {
    ...SLIDE_OUT_DOWN_TO_VARS,
    duration: MotionDuration.SlideOut,
    ease: MotionEase.McIn,
    onComplete: options.onComplete,
  });
}

/**
 * Kills every tween currently driving `targets` and leaves their last-frame
 * values inline. For consumers that take over an element with a hand-rolled
 * choreography (e.g. `DisambiguationPanel`'s select animation, which writes
 * inline transform/opacity itself): an in-flight entrance tween would keep
 * writing per frame and fight those manual styles — the same hazard the CSS
 * era solved with `animation: "none"`. Callers overwrite the residue with
 * their own inline values right after.
 *
 * @param targets - Element(s) whose in-flight tweens must stop.
 */
export function killEntranceTweens(targets: gsap.DOMTarget): void {
  setupMotion();
  gsap.killTweensOf(targets);
}
