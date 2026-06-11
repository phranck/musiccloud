import gsap from "gsap";
import { MotionDuration, MotionEase } from "./constants";
import { prefersReducedMotion, setupMotion } from "./setup";

/**
 * Timeline factory for the album-artwork cover swap in
 * `components/cards/SongInfo.tsx` — the GSAP port of the retired
 * `.mc-cover-slide-in` / `.mc-cover-slide-out` CSS classes (900ms, `mcOut`):
 * the outgoing cover slides down out of the square TFT screen while the
 * incoming cover slides in from above. Deliberately specific to that one
 * consumer (KISS/YAGNI), mirroring how `swap.ts` is specific to `SmoothSwap`.
 *
 * Keyframe parity: `translate3d(0, -100%, 0) → 0` (in) and
 * `0 → translate3d(0, 100%, 0)` (out), transform-only — the covers never
 * cross-fade, the clipped screen (`overflow: hidden` via `TftScreen`) carries
 * the reveal. Both buffers are the same square size, so unlike `swap.ts`
 * there is no height scale and no counter-scale — pure compositor slides.
 *
 * Interrupt contract: unlike `swap.ts` there is no module-level registry —
 * both buffer elements are remounted per swap generation (fresh keys) and the
 * consumer owns exactly one timeline at a time, so the consumer kills its
 * in-flight predecessor itself before building the successor (suppressing the
 * superseded settle, same kill-not-revert reasoning as `swap.ts`).
 *
 * Reduced motion: one-shot `prefersReducedMotion()` read at trigger time;
 * returns `null` without writing styles, and the caller must settle (unmount
 * the outgoing cover) immediately — the commit already shows the incoming
 * cover at its final position.
 *
 * Setup contract: calls `setupMotion()` first (tree-shaking safety, see
 * `setup.ts`).
 */

/** `yPercent` the incoming cover starts from — exact port of the `mc-cover-slide-in` keyframe. */
const COVER_IN_FROM_Y_PERCENT = -100;

/** `yPercent` the outgoing cover slides out to — exact port of the `mc-cover-slide-out` keyframe. */
const COVER_OUT_TO_Y_PERCENT = 100;

/** Options for {@link buildCoverSwapTimeline}. */
interface CoverSwapTimelineOptions {
  /** The freshly mounted cover that slides in from above. */
  incoming: HTMLElement;
  /** The previous cover that slides down out of the clipped screen. */
  outgoing: HTMLElement;
  /**
   * Called exactly once after natural completion — the consumer unmounts the
   * outgoing cover here (replaces the old fixed `setTimeout`). NOT called
   * when the timeline is killed (an interrupting swap supersedes the settle)
   * and NOT on the `null` reduced-motion path (the caller settles itself).
   */
  onSettle: () => void;
}

/**
 * Builds and starts the cover swap: both slides run in parallel over
 * {@link MotionDuration.CoverSwap} with the `mcOut` ease. Build it inside a
 * pre-paint effect (`useGSAP` layout phase) so the start positions are
 * applied before the swap commit's first paint — otherwise the incoming
 * cover would flash at its final position for one frame.
 *
 * @param options - Buffer elements and the settle callback (see {@link CoverSwapTimelineOptions}).
 * @returns The running timeline, or `null` when the user prefers reduced
 *   motion — no styles are written then, and the caller must settle
 *   immediately.
 */
export function buildCoverSwapTimeline(options: CoverSwapTimelineOptions): gsap.core.Timeline | null {
  setupMotion();
  if (prefersReducedMotion()) return null;
  const { incoming, outgoing, onSettle } = options;

  const timeline = gsap.timeline();
  timeline.fromTo(
    incoming,
    { yPercent: COVER_IN_FROM_Y_PERCENT },
    { yPercent: 0, duration: MotionDuration.CoverSwap, ease: MotionEase.McOut, immediateRender: true },
    0,
  );
  timeline.fromTo(
    outgoing,
    { yPercent: 0 },
    {
      yPercent: COVER_OUT_TO_Y_PERCENT,
      duration: MotionDuration.CoverSwap,
      ease: MotionEase.McOut,
      immediateRender: true,
    },
    0,
  );
  timeline.eventCallback("onComplete", () => {
    // The incoming cover ends clean (it persists as the new current cover);
    // the outgoing cover keeps its final transform — it sits below the clip
    // and unmounts in onSettle (clearing it first would flash it back over
    // the new cover for a frame).
    gsap.set(incoming, { clearProps: "transform" });
    onSettle();
  });
  return timeline;
}
