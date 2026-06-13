import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { MotionDuration, MotionEase } from "./constants";
import { prefersReducedMotion, setupMotion } from "./setup";

/**
 * Thin project wrapper around the GSAP Flip plugin (`Flip.getState` /
 * `Flip.from`) with the musiccloud motion defaults baked in.
 *
 * FLIP model: consumers capture a layout snapshot while the OLD layout is
 * still measurable, let the layout change happen exactly once (React commit),
 * and then animate FROM the snapshot. All visible motion is compositor-only
 * (`transform`/`opacity`); layout properties are never animated (performance
 * policy of plan MC-029).
 *
 * Defaults applied by {@link animateFlipFrom}:
 * - `ease: MotionEase.McOut`, `duration: MotionDuration.Grid`
 * - `scale: true` — size changes animate as scaleX/scaleY, never width/height
 * - `absolute: true` — flipped elements are `position: absolute` during the
 *   flip so flex/grid reflow cannot fight the transforms (overridable per
 *   call: containers whose size change should scale-animate must stay in
 *   flow, Flip then locks their layout size for the duration of the flip)
 * - `nested: true` — when a container and its children are both flip targets,
 *   Flip compensates the children for the container's own transform
 * - `onEnter`/`onLeave` — fade+scale tweens for added/removed elements
 *
 * Reduced motion (regression guard): the global CSS rule in
 * `styles/animations.css` (`@media (prefers-reduced-motion: reduce)`) only
 * neutralizes CSS animations/transitions — GSAP tweens are JS-driven and NOT
 * covered by it. Every animate* entry point therefore performs a one-shot
 * `prefersReducedMotion()` read at trigger time and returns `null` without
 * creating a tween. Skipping is the correct reduced path: after the React
 * commit the DOM already shows the final layout, so "no animation" equals
 * "instant end state". Read-at-trigger is intentional — each flip is a
 * discrete event; a persistent `gsap.matchMedia()` context is reserved for
 * long-lived conditional animations (later MC-029 task).
 *
 * Setup contract: every exported function calls `setupMotion()` first. The
 * consumer contract in `setup.ts` forbids relying on import side effects
 * (bundlers may tree-shake them); the explicit call is the durable guarantee
 * and is a no-op boolean check after the first invocation.
 */

/**
 * Start values for elements entering the layout: slightly raised, slightly
 * shrunk and transparent. Exact port of the previous hand-rolled grid
 * entrance (`translate3d(0, -10px, 0) scale3d(0.97, 0.97, 1)`, `opacity: 0`).
 */
const ENTER_FROM_VARS: gsap.TweenVars = { opacity: 0, scale: 0.97, y: -10 };

/** End values entering elements settle at: natural position, fully opaque. */
const ENTER_TO_VARS: gsap.TweenVars = { opacity: 1, scale: 1, y: 0 };

/**
 * End values for elements leaving the layout: fade out while shrinking to the
 * same scale the entrance starts from (symmetric in/out motion).
 */
const LEAVE_TO_VARS: gsap.TweenVars = { opacity: 0, scale: 0.97 };

/**
 * Layout snapshot captured by {@link captureFlipState} and consumed by
 * {@link animateFlipFrom}. Alias for GSAP's `Flip.FlipState` so consumers can
 * type refs without importing the Flip plugin themselves.
 */
export type CapturedFlipState = ReturnType<typeof Flip.getState>;

/**
 * Options for {@link animateFlipFrom}. Deliberately small (KISS): only knobs
 * with a concrete consumer exist.
 */
interface AnimateFlipFromOptions {
  /**
   * Elements participating in the flip — must be the CURRENT (post-commit)
   * element set, including freshly added elements (Flip detects them as
   * "entering" because they are missing from the captured state).
   */
  targets: gsap.DOMTarget;
  /**
   * Tween duration in seconds. Defaults to {@link MotionDuration.Grid};
   * other flip consumers (e.g. the search-field return) pass their own
   * `MotionDuration` constant.
   */
  duration?: number;
  /**
   * Which targets are made `position: absolute` during the flip. Defaults to
   * `true` (all targets). Pass only the child elements when a container is
   * part of the flip: the container must remain in flow so Flip can lock its
   * layout size (preventing collapse under absolute children) while its
   * visual size change is scale-animated. For a single in-flow element whose
   * siblings/parent do not flip along (e.g. a field inside a flex column),
   * pass `false`: `absolute: true` would take the element out of flow,
   * collapsing the parent and making the siblings jump during the flip.
   */
  absolute?: boolean | gsap.DOMTarget;
}

/**
 * Builds the shared fade+scale entrance tween. Used both as the flip's
 * `onEnter` and by {@link animateFlipEnter} so first-mount and reflow
 * entrances look identical (DRY).
 *
 * @param targets - The entering elements.
 * @param duration - Tween duration in seconds.
 * @returns The entrance tween (added to the flip timeline when used as onEnter).
 */
function buildEnterTween(targets: gsap.TweenTarget, duration: number): gsap.core.Tween {
  return gsap.fromTo(targets, ENTER_FROM_VARS, { ...ENTER_TO_VARS, duration, ease: MotionEase.McOut });
}

/**
 * Builds the fade+scale exit tween wired into the flip's `onLeave` callback.
 *
 * @param targets - The leaving elements (must still be in the document).
 * @param duration - Tween duration in seconds.
 * @returns The exit tween.
 */
function buildLeaveTween(targets: gsap.TweenTarget, duration: number): gsap.core.Tween {
  return gsap.to(targets, { ...LEAVE_TO_VARS, duration, ease: MotionEase.McOut });
}

/**
 * Captures the current positions/sizes of `targets` as the "before" state of
 * the next flip. In React, call it at the START of every layout-effect run,
 * BEFORE {@link animateFlipFrom} — the snapshot describes the layout the NEXT
 * commit replaces. The order is load-bearing: capturing AFTER starting a flip
 * in the same effect run would force-complete that flip immediately (see the
 * side effect below) and kill the animation at progress 0.
 *
 * Side effect (GSAP semantics): capturing a state for targets with an
 * in-flight flip force-completes that flip first, so measurements are always
 * taken from a clean, untransformed layout. This is also the interruption
 * story for rapid successive reflows: each one restarts cleanly from the
 * latest committed layout.
 *
 * Capturing is intentionally NOT gated on reduced motion: it is a handful of
 * rect reads per discrete layout change (no per-frame work), and keeping the
 * snapshot machinery unconditional means the decision to animate stays a
 * per-trigger one-shot inside {@link animateFlipFrom}.
 *
 * @param targets - Elements to snapshot (container + children for grid flips).
 * @returns The captured Flip state to pass to {@link animateFlipFrom}.
 */
export function captureFlipState(targets: gsap.DOMTarget): CapturedFlipState {
  setupMotion();
  return Flip.getState(targets);
}

/**
 * Animates `options.targets` from a previously captured state to their
 * current (post-commit) layout using the project Flip defaults (see module
 * doc). Entering elements (in `targets` but not in `state`) play the shared
 * fade+scale entrance; leaving elements play the fade+scale exit — note that
 * GSAP can only animate leaving elements that are still in the document
 * (e.g. hidden via `display: none`). Elements unmounted by React are gone
 * before the flip starts and simply disappear (intentional parity with the
 * previous hand-rolled grid FLIP, which never animated removals either).
 *
 * Reduced motion: returns `null` without creating any tween — the DOM already
 * shows the final layout, so skipping IS the instant end state.
 *
 * @param state - The "before" snapshot from {@link captureFlipState}.
 * @param options - Current targets plus optional duration/absolute overrides.
 * @returns The Flip timeline, or `null` when reduced motion is requested.
 */
export function animateFlipFrom(state: CapturedFlipState, options: AnimateFlipFromOptions): gsap.core.Timeline | null {
  setupMotion();
  if (prefersReducedMotion()) return null;
  const { targets, duration = MotionDuration.Grid, absolute = true } = options;
  return Flip.from(state, {
    targets,
    duration,
    ease: MotionEase.McOut,
    scale: true,
    absolute,
    nested: true,
    onEnter: (elements) => buildEnterTween(elements, duration),
    onLeave: (elements) => buildLeaveTween(elements, duration),
  });
}

/**
 * Plays the fade+scale entrance tween for elements that appear without a
 * positional flip — e.g. all tiles on the first mount of a grid (including
 * hydration of SSR-rendered markup), where no "before" state exists to flip
 * from. Uses the exact same vars as the flip's `onEnter`, so first-mount and
 * reflow entrances look identical.
 *
 * Reduced motion: returns `null` without creating a tween (one-shot read at
 * trigger time, same contract as {@link animateFlipFrom}).
 *
 * @param targets - The entering elements.
 * @param duration - Tween duration in seconds; defaults to {@link MotionDuration.Grid}.
 * @returns The entrance tween, or `null` when reduced motion is requested.
 */
export function animateFlipEnter(
  targets: gsap.TweenTarget,
  duration: number = MotionDuration.Grid,
): gsap.core.Tween | null {
  setupMotion();
  if (prefersReducedMotion()) return null;
  return buildEnterTween(targets, duration);
}
