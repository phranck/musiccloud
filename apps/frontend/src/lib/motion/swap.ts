import gsap from "gsap";
import { MotionDuration, MotionEase } from "./constants";
import { prefersReducedMotion, setupMotion } from "./setup";

/**
 * Timeline factories for the `SmoothSwap` double-buffer component
 * (`components/ui/SmoothSwap.tsx`). Deliberately specific to that component's
 * two animation paths (KISS/YAGNI — no generic swap framework):
 *
 * 1. {@link buildSwapTimeline} — key change: the old subtree slides out
 *    downward, the new subtree slides in from above (exact port of the
 *    retired `mc-group-slide-out` / `mc-group-slide-in` CSS keyframes), while
 *    the wrapper's height change plays as a FLIP scale animation.
 * 2. {@link buildResizeTimeline} — in-place content resize (no key change,
 *    reported by a ResizeObserver): only the wrapper FLIP scale part.
 *
 * FLIP mechanics (replaces the old `height` transition — zero layout work per
 * frame, plan MC-029 performance policy): the wrapper's layout height changes
 * exactly once at React commit (the previous buffer is `position: absolute`,
 * so the in-flow current buffer defines the new natural height). The factory
 * then inverts visually via `scaleY = fromHeight / toHeight` and tweens to 1.
 * Both buffers receive an exact per-frame counter-scale
 * (`childScaleY = 1 / wrapperScaleY`, written through a `gsap.quickSetter` in
 * the wrapper tween's `onUpdate`) so content is never distorted: the product
 * of the two scales is exactly 1 on every frame, unlike tweening inverse
 * endpoint values with the same ease (which deviates mid-flight). Visually
 * this reproduces the old behavior — a top-anchored clip window that grows or
 * shrinks over the sliding content — using only compositor properties.
 *
 * Why not the `Flip` plugin (`Flip.getState`/`Flip.from`, plan wording):
 * React remounts BOTH buffers with fresh keys on every swap, so the plugin
 * has no persistent child elements to match across states — its automatic
 * nested counter-scaling can never engage, and a manual counter-scale is
 * required either way. The "first" state also needs no pre-commit capture:
 * the previous buffer still renders the old content at the same width
 * post-commit, so its measured height IS the old wrapper height. And the
 * resize path has no "before" DOM state at all (ResizeObserver fires after
 * layout). A measured-height scale FLIP serves both paths with one mechanism;
 * the `setupMotion()` and reduced-motion contracts from `flip.ts` hold
 * identically.
 *
 * Reduced motion: both factories perform a one-shot `prefersReducedMotion()`
 * read at trigger time and return `null` without writing any styles — after
 * the React commit the wrapper already sits at the new content's natural
 * height, so skipping IS the instant end state (same contract as `flip.ts`;
 * the CSS reduced-motion rule in `animations.css` does not cover JS tweens).
 *
 * Cleanup contract: on natural completion the factories `clearProps` the
 * persistent elements (wrapper, current buffer), so no stale inline styles
 * survive a settled animation and natural auto-height behavior is restored.
 * The previous buffer intentionally keeps its final transform (slid below the
 * clip) until React unmounts it — clearing it earlier would flash the old
 * content over the new one for a frame.
 *
 * Interrupt contract: building a timeline first kills the wrapper's
 * registered in-flight predecessor — swap or resize, see
 * {@link activeTimelines} — and strips its transform residue. Kill, not
 * revert: the predecessor's `onComplete` (and with it its `clearProps`/settle
 * work) must never fire into the successor's run, and the wrapper is
 * stripped and re-measured fresh anyway. `useGSAP` cannot do this: with a
 * dependency array it defers its context revert to unmount, so it never
 * cleans up between effect runs.
 */

/** Milliseconds per second — converts the public `durationMs` prop (SmoothSwap API) into GSAP seconds at this boundary. */
const MS_PER_SECOND = 1000;

/**
 * Default swap duration in milliseconds. Derived from
 * {@link MotionDuration.Swap} (0.68 s) so the single source of truth stays in
 * `constants.ts`; exported in milliseconds because `SmoothSwap`'s public
 * `durationMs` prop keeps its millisecond semantics (was 680 ms).
 */
export const DEFAULT_SWAP_DURATION_MS = MotionDuration.Swap * MS_PER_SECOND;

/**
 * `yPercent` the entering buffer starts from — exact port of the retired
 * `mc-group-slide-in` keyframe (`translate3d(0, -112%, 0)` → 0). The 12 %
 * overshoot beyond the element's own height keeps a visible gap between the
 * two buffers mid-flight: the keyframes were deliberately transform-only
 * ("no crossfade"), so the buffers must never overlap and opacity is not
 * animated here either (motion parity).
 */
const SLIDE_IN_FROM_Y_PERCENT = -112;

/** `yPercent` the leaving buffer slides out to — exact port of the retired `mc-group-slide-out` keyframe (0 → `translate3d(0, 112%, 0)`). */
const SLIDE_OUT_TO_Y_PERCENT = 112;

/**
 * Top-anchored transform origin for the wrapper scale and the buffer
 * counter-scales. Content flows from the top (like the old height animation,
 * which kept the top edge fixed while the bottom edge moved), and matching
 * origins are what make the per-frame counter-scale cancel out exactly.
 */
const TOP_ANCHORED_ORIGIN = "50% 0";

/**
 * Inline properties cleared from persistent elements on natural completion
 * and stripped as defensive residue cleanup before building a new timeline
 * (an interrupted/killed timeline leaves its last frame's values inline).
 * Cleared via `gsap.set(..., { clearProps })` rather than direct style writes
 * so GSAP's internal transform cache is reset alongside the DOM.
 */
const TRANSFORM_CLEAR_PROPS = "transform,transformOrigin";

/**
 * Live timeline per wrapper, so the next build on the same wrapper can kill
 * its in-flight predecessor (interrupt contract). Spans BOTH factories: a new
 * swap may interrupt a running swap or a running in-place resize — the
 * resize timeline is owned by a `useEffect` in `SmoothSwap` whose teardown
 * kill only runs after paint, too late for the pre-paint layout effect that
 * builds the next swap. A WeakMap keeps unmounted wrappers and their
 * timelines GC-eligible.
 */
const activeTimelines = new WeakMap<HTMLElement, gsap.core.Timeline>();

/**
 * Kills (not reverts) the wrapper's registered in-flight timeline, if any.
 * Kill suppresses the predecessor's `onComplete`, so its `clearProps`/settle
 * can never fire mid-flight into the successor's run; the predecessor's
 * last-frame inline styles stay put and are stripped by the caller's
 * `clearProps` pass right after.
 */
function killActiveTimeline(wrapper: HTMLElement): void {
  activeTimelines.get(wrapper)?.kill();
  activeTimelines.delete(wrapper);
}

/**
 * Minimum height in px for the scale FLIP to engage. Guards the
 * `fromHeight / toHeight` ratio against collapsed (zero-height) buffers and
 * doubles as the "no visible size change" epsilon: below 1 px difference the
 * scale tween is skipped and only the slide tweens (swap path) play.
 */
const MIN_SCALE_HEIGHT_PX = 1;

/** Options for {@link buildSwapTimeline}. */
interface SwapTimelineOptions {
  /** Clipping wrapper (`overflow: hidden`) whose visual height change is scale-animated. Persists across swaps. */
  wrapper: HTMLElement;
  /** In-flow buffer holding the NEW content; defines the wrapper's committed layout height. Fresh-mounted per swap. */
  current: HTMLElement;
  /** Out-of-flow (`position: absolute`) buffer holding the OLD content. Fresh-mounted per swap, unmounted on settle. */
  previous: HTMLElement;
  /** Swap duration in milliseconds (the SmoothSwap public-API unit); converted to seconds for GSAP inside the factory. */
  durationMs: number;
  /**
   * Called exactly once after natural completion and style cleanup — the
   * component unmounts the previous buffer here. NOT called when the timeline
   * is killed/interrupted (the next swap supersedes the settle).
   */
  onSettle: () => void;
}

/** Options for {@link buildResizeTimeline}. */
interface ResizeTimelineOptions {
  /** Clipping wrapper whose visual height change is scale-animated. */
  wrapper: HTMLElement;
  /** The (only) content buffer that resized in place; receives the counter-scale. */
  current: HTMLElement;
  /** Height in px the wrapper visually animates from (the last settled content height tracked by the caller). */
  fromHeight: number;
  /** New committed content height in px — the wrapper already sits at this layout height when the factory runs. */
  toHeight: number;
  /** Animation duration in milliseconds; converted to seconds for GSAP inside the factory. */
  durationMs: number;
}

/**
 * Adds the wrapper scale FLIP plus the exact per-frame counter-scale to
 * `timeline` (shared core of both factories). No-op when either height is
 * unmeasurable/collapsed or the difference is below
 * {@link MIN_SCALE_HEIGHT_PX} — there is no size change worth animating, and
 * skipping also guards the ratio against division by zero.
 *
 * The counter-scale is applied once synchronously after creating the tween:
 * `immediateRender` puts the wrapper at its start scale before the first
 * paint, but `onUpdate` only fires from the first ticker tick — without the
 * synchronous call, frame 0 would paint the buffers distorted.
 *
 * @param timeline - Timeline the tween is added to (at position 0).
 * @param wrapper - The clipping wrapper being scale-animated.
 * @param counterScaleTargets - Buffers that receive `scaleY = 1 / wrapperScaleY` each frame.
 * @param fromHeight - Old visual height in px.
 * @param toHeight - New committed layout height in px.
 * @param durationSeconds - Tween duration in seconds.
 */
function addHeightScaleTweens(
  timeline: gsap.core.Timeline,
  wrapper: HTMLElement,
  counterScaleTargets: HTMLElement[],
  fromHeight: number,
  toHeight: number,
  durationSeconds: number,
): void {
  if (fromHeight < MIN_SCALE_HEIGHT_PX || toHeight < MIN_SCALE_HEIGHT_PX) return;
  if (Math.abs(fromHeight - toHeight) < MIN_SCALE_HEIGHT_PX) return;

  gsap.set([wrapper, ...counterScaleTargets], { transformOrigin: TOP_ANCHORED_ORIGIN });
  const applyCounterScale = gsap.quickSetter(counterScaleTargets, "scaleY");
  const startScale = fromHeight / toHeight;

  timeline.fromTo(
    wrapper,
    { scaleY: startScale },
    {
      scaleY: 1,
      duration: durationSeconds,
      ease: MotionEase.McOut,
      immediateRender: true,
      // Per-frame inverse keeps wrapperScaleY * bufferScaleY exactly 1, so
      // content never distorts. quickSetter + a primitive read = zero
      // allocations per frame (plan MC-029 policy 7).
      onUpdate: () => {
        applyCounterScale(1 / (gsap.getProperty(wrapper, "scaleY") as number));
      },
    },
    0,
  );
  applyCounterScale(1 / startScale);
}

/**
 * Builds and starts the double-buffer swap timeline: previous buffer slides
 * out downward, current buffer slides in from above, and the wrapper's height
 * change plays as a scale FLIP with per-frame counter-scaled buffers (see
 * module doc). Runs synchronously inside a layout effect, so the start values
 * are applied before the commit's first paint (`immediateRender`).
 *
 * Measures both buffers itself (one read-only layout pass — the single
 * at-commit layout the performance policy allows): the previous buffer still
 * renders the old content at the unchanged wrapper width, so its height is
 * the old wrapper height; the current buffer's height is the new natural
 * wrapper height. Before measuring, the wrapper's in-flight predecessor
 * timeline (swap or resize) is killed and its transform residue stripped —
 * the buffers themselves are always fresh-mounted and start clean.
 *
 * @param options - Elements, duration and settle callback (see {@link SwapTimelineOptions}).
 * @returns The running timeline, or `null` when the user prefers reduced
 *   motion — no styles are written then, and the caller must settle (unmount
 *   the previous buffer) immediately.
 */
export function buildSwapTimeline(options: SwapTimelineOptions): gsap.core.Timeline | null {
  setupMotion();
  const { wrapper, current, previous, durationMs, onSettle } = options;
  killActiveTimeline(wrapper);
  gsap.set(wrapper, { clearProps: TRANSFORM_CLEAR_PROPS });
  if (prefersReducedMotion()) return null;

  const durationSeconds = durationMs / MS_PER_SECOND;
  // Rect heights are transform-affected, but both buffers are fresh-mounted
  // and untransformed at this point (predecessor killed + wrapper residue
  // stripped above), so these reads ARE the natural layout heights.
  const fromHeight = previous.getBoundingClientRect().height;
  const toHeight = current.getBoundingClientRect().height;

  const timeline = gsap.timeline();
  addHeightScaleTweens(timeline, wrapper, [previous, current], fromHeight, toHeight, durationSeconds);
  timeline.fromTo(
    current,
    { yPercent: SLIDE_IN_FROM_Y_PERCENT },
    { yPercent: 0, duration: durationSeconds, ease: MotionEase.McOut, immediateRender: true },
    0,
  );
  timeline.fromTo(
    previous,
    { yPercent: 0 },
    { yPercent: SLIDE_OUT_TO_Y_PERCENT, duration: durationSeconds, ease: MotionEase.McOut, immediateRender: true },
    0,
  );

  timeline.eventCallback("onComplete", () => {
    // Persistent elements end clean (no stale inline styles, natural auto
    // height restored). The previous buffer keeps its final transform — it
    // sits below the clip and unmounts in onSettle; clearing it first would
    // flash the old content over the new one for a frame.
    gsap.set([wrapper, current], { clearProps: TRANSFORM_CLEAR_PROPS });
    activeTimelines.delete(wrapper);
    onSettle();
  });
  activeTimelines.set(wrapper, timeline);
  return timeline;
}

/**
 * Builds and starts the in-place resize timeline: only the wrapper scale FLIP
 * with the counter-scaled current buffer — no slides, the content itself did
 * not change identity (ResizeObserver path of `SmoothSwap`, e.g. an image
 * finishing to load inside the active content).
 *
 * Heights are passed in (not measured): the "from" height is the caller's
 * settled-height bookkeeping — by the time a ResizeObserver reports, the old
 * layout is gone and only the caller still knows it. The wrapper's in-flight
 * predecessor timeline is killed first (same interrupt contract as the swap
 * path); unlike the swap buffers, `current` persists across resize events, so
 * residue cleanup before building covers both elements here.
 *
 * @param options - Elements, both heights and the duration (see {@link ResizeTimelineOptions}).
 * @returns The running timeline, or `null` when the user prefers reduced
 *   motion (the commit already shows the final layout; nothing to do).
 */
export function buildResizeTimeline(options: ResizeTimelineOptions): gsap.core.Timeline | null {
  setupMotion();
  const { wrapper, current, fromHeight, toHeight, durationMs } = options;
  killActiveTimeline(wrapper);
  gsap.set([wrapper, current], { clearProps: TRANSFORM_CLEAR_PROPS });
  if (prefersReducedMotion()) return null;

  const timeline = gsap.timeline();
  addHeightScaleTweens(timeline, wrapper, [current], fromHeight, toHeight, durationMs / MS_PER_SECOND);
  timeline.eventCallback("onComplete", () => {
    gsap.set([wrapper, current], { clearProps: TRANSFORM_CLEAR_PROPS });
    activeTimelines.delete(wrapper);
  });
  activeTimelines.set(wrapper, timeline);
  return timeline;
}
