import gsap from "gsap";
import { MotionDuration, MotionEase } from "./constants";
import { prefersReducedMotion, setupMotion } from "./setup";

/**
 * Timeline factories for `components/ui/CollapsibleSection.tsx` — the
 * compositor-only replacement of its `grid-template-rows` CSS transition
 * (a layout property: ~1 layout pass per frame over 680ms on every resolve
 * flow, the plan-MC-029 Phase-2 gate blocker).
 *
 * Mechanism — "curtain reveal" (two synchronized opposite translations):
 * three nested elements collaborate, all motion is `transform`/`opacity`:
 *
 *   shell   — stationary clipping frame (`overflow: hidden`); carries the
 *             whole-section opacity fade. Its layout height changes exactly
 *             ONCE per transition (children mount at expand start / unmount
 *             at collapse end), never per frame.
 *   curtain — clipping window (`overflow: hidden`), translated by ∓100% of
 *             its own height.
 *   content — the section content, counter-translated by ±100%.
 *
 * With equal eases the two translations cancel exactly: the content stands
 * still at its natural position on every frame while the visible region
 * (shell ∩ curtain) grows from the top edge downwards — the same top-anchored
 * reveal the `grid-rows-[0fr→1fr]` transition produced, but with zero layout
 * work per frame and zero per-frame JS (no `onUpdate`; percent transforms
 * need no height measurement, so a zero-height start state is not a special
 * case). The shell's own clip also keeps the upward-translated curtain from
 * painting or hit-testing over preceding siblings.
 *
 * Why not the scale FLIP from `swap.ts` (`addHeightScaleTweens`): collapsing
 * to height 0 degenerates that mechanism — the `fromHeight/toHeight` ratio
 * hits its division guard at 0, and the per-frame counter-scale
 * (`1 / wrapperScaleY`) diverges to infinity near 0, forcing the browser to
 * rasterize absurdly stretched layers. The curtain pair has no ratio and no
 * counter-scale, so it covers the 0↔natural range exactly.
 *
 * One-shot layout semantics (consistent with Task 2.4 / `SmoothSwap`):
 * surrounding elements no longer glide with the section — they reposition
 * once at the expand commit and once at the collapse unmount. The visual
 * transition itself is carried entirely by the curtain.
 *
 * Interrupt contract: building a timeline first kills the shell's registered
 * in-flight predecessor (expand or collapse) — kill, not revert, so the
 * predecessor's `onComplete`/settle can never fire into the successor's run
 * (same reasoning as `swap.ts`). Direction reversals resume from the killed
 * predecessor's current inline values (no snap): both factories tween TO
 * their end values (`gsap.to` semantics). Unlike the old CSS transition the
 * reverse leg plays its full duration — CSS shortens an interrupted reversal
 * proportionally (reversing shortening factor), GSAP does not, so a section
 * reversed at 50% takes the full 680ms back instead of ~340ms. Only a fresh
 * expand (children just mounted, no inline state) explicitly seeds the
 * closed start values — see {@link ExpandTimelineOptions.fromCollapsed}.
 *
 * Instant paths: each factory supports the consumer's "render the end state
 * now" cases — reduced motion (one-shot `prefersReducedMotion()` read; the
 * CSS reduced-motion rule does not cover JS tweens) and the caller-side
 * `instant` flag (CollapsibleSection's `disableMobileCollapse` viewport
 * gate). Both return `null` AFTER stripping residue, so the section lands in
 * its clean end state: expand callers need nothing further (the commit
 * already shows the open section), collapse callers must run their
 * `onCollapsed` work (unmount) synchronously.
 *
 * Setup contract: every export calls `setupMotion()` first (tree-shaking
 * safety, see `setup.ts`).
 */

/** `yPercent` of the curtain in the fully collapsed state (clip window raised by its own height). */
const CURTAIN_COLLAPSED_Y_PERCENT = -100;

/** `yPercent` of the content in the fully collapsed state (counter-translation keeping it visually in place). */
const CONTENT_COLLAPSED_Y_PERCENT = 100;

/**
 * Inline properties stripped from all three elements before building a
 * timeline (defensive residue cleanup — a killed predecessor leaves its last
 * frame inline, a completed collapse intentionally leaves the shell's
 * `opacity: 0`) and cleared again on natural expand completion. Cleared via
 * `gsap.set(..., { clearProps })` so GSAP's transform cache resets alongside
 * the DOM.
 */
const COLLAPSE_CLEAR_PROPS = "transform,opacity";

/**
 * Live timeline per shell so the next build on the same section can kill its
 * in-flight predecessor (interrupt contract, mirrors `swap.ts`). A WeakMap
 * keeps unmounted shells and their timelines GC-eligible.
 */
const activeTimelines = new WeakMap<HTMLElement, gsap.core.Timeline>();

/**
 * Kills (not reverts) the shell's registered in-flight timeline, if any.
 * Kill suppresses the predecessor's `onComplete`, so a superseded collapse
 * can never unmount the children an interrupting expand is revealing.
 */
function killActiveTimeline(shell: HTMLElement): void {
  activeTimelines.get(shell)?.kill();
  activeTimelines.delete(shell);
}

/** The three collaborating elements of one collapsible section (see module doc). */
interface CollapseElements {
  /** Stationary clipping frame; receives the opacity fade. Persists across open/close cycles. */
  shell: HTMLElement;
  /** Translated clip window (`overflow: hidden`). Remounts per open cycle. */
  curtain: HTMLElement;
  /** Counter-translated section content. Remounts per open cycle. */
  content: HTMLElement;
}

/** Options for {@link buildExpandTimeline}. */
interface ExpandTimelineOptions extends CollapseElements {
  /**
   * `true` when the section was settled-closed and the children were mounted
   * in this very commit: the fresh elements carry no inline state, so the
   * factory seeds the collapsed start values (curtain ∓100%, opacity 0)
   * before tweening — pre-paint, so the open content never flashes.
   * `false` when the expand interrupts a running collapse: the elements
   * already carry mid-flight inline values and the tween resumes from them.
   */
  fromCollapsed: boolean;
  /** Caller-side instant gate (e.g. mobile always-open sections): skip the animation, land open. */
  instant?: boolean;
}

/** Options for {@link buildCollapseTimeline}. */
interface CollapseTimelineOptions extends CollapseElements {
  /**
   * Called exactly once after natural completion — the consumer unmounts the
   * children here (replaces the old `setTimeout`). NOT called when the
   * timeline is killed (an interrupting expand keeps the children) and NOT
   * on the `null` instant/reduced paths (the caller unmounts synchronously).
   */
  onCollapsed: () => void;
  /** Caller-side instant gate: skip the animation; the caller unmounts immediately. */
  instant?: boolean;
}

/**
 * Builds and starts the open transition: curtain and content translate back
 * to 0 while the shell fades in, over {@link MotionDuration.Collapse} with
 * the `mcOut` ease (the exact timing of the old CSS transition). Build it
 * inside a pre-paint effect (`useGSAP` layout phase) in the same commit that
 * mounted the children.
 *
 * On natural completion all inline styles are cleared — a settled-open
 * section is indistinguishable from one that never animated.
 *
 * @param options - Elements plus the fresh/resume and instant flags (see {@link ExpandTimelineOptions}).
 * @returns The running timeline, or `null` on the instant/reduced-motion
 *   paths — residue is stripped and the commit already shows the open
 *   section, so the caller needs no further work.
 */
export function buildExpandTimeline(options: ExpandTimelineOptions): gsap.core.Timeline | null {
  setupMotion();
  const { shell, curtain, content, fromCollapsed, instant = false } = options;
  killActiveTimeline(shell);
  if (instant || prefersReducedMotion()) {
    gsap.set([shell, curtain, content], { clearProps: COLLAPSE_CLEAR_PROPS });
    return null;
  }

  if (fromCollapsed) {
    // Fresh mount: curtain/content carry no inline state yet; seeding the
    // closed start values also overwrites the shell's intentional
    // `opacity: 0` residue from the previous settled collapse. The resume
    // case (`fromCollapsed: false`) deliberately seeds nothing — the tweens
    // below pick up the killed predecessor's current inline values.
    gsap.set(curtain, { yPercent: CURTAIN_COLLAPSED_Y_PERCENT });
    gsap.set(content, { yPercent: CONTENT_COLLAPSED_Y_PERCENT });
    gsap.set(shell, { opacity: 0 });
  }

  const timeline = gsap.timeline();
  timeline.to(curtain, { yPercent: 0, duration: MotionDuration.Collapse, ease: MotionEase.McOut }, 0);
  timeline.to(content, { yPercent: 0, duration: MotionDuration.Collapse, ease: MotionEase.McOut }, 0);
  timeline.to(shell, { opacity: 1, duration: MotionDuration.Collapse, ease: MotionEase.McOut }, 0);
  timeline.eventCallback("onComplete", () => {
    gsap.set([shell, curtain, content], { clearProps: COLLAPSE_CLEAR_PROPS });
    activeTimelines.delete(shell);
  });
  activeTimelines.set(shell, timeline);
  return timeline;
}

/**
 * Builds and starts the close transition: curtain and content translate to
 * their collapsed offsets while the shell fades out, over
 * {@link MotionDuration.Collapse} with the `mcOut` ease. Always resumes from
 * the current values (`gsap.to`), so interrupting a running expand reverses
 * without a snap — though unlike a CSS transition the reverse leg plays its
 * full duration (no proportional reversing shortening; see module doc).
 *
 * On natural completion the shell intentionally KEEPS its inline
 * `opacity: 0` while `onCollapsed` unmounts the children one commit later —
 * clearing it first would flash the content back at full opacity for that
 * frame. The residue is harmless on the then-empty (zero-height) shell and
 * is stripped by the next build.
 *
 * @param options - Elements plus the unmount callback and instant flag (see {@link CollapseTimelineOptions}).
 * @returns The running timeline, or `null` on the instant/reduced-motion
 *   paths — the caller must then run its `onCollapsed` work synchronously
 *   (the close must not depend on an animation playing).
 */
export function buildCollapseTimeline(options: CollapseTimelineOptions): gsap.core.Timeline | null {
  setupMotion();
  const { shell, curtain, content, onCollapsed, instant = false } = options;
  killActiveTimeline(shell);
  if (instant || prefersReducedMotion()) {
    gsap.set([shell, curtain, content], { clearProps: COLLAPSE_CLEAR_PROPS });
    return null;
  }

  const timeline = gsap.timeline();
  timeline.to(
    curtain,
    { yPercent: CURTAIN_COLLAPSED_Y_PERCENT, duration: MotionDuration.Collapse, ease: MotionEase.McOut },
    0,
  );
  timeline.to(
    content,
    { yPercent: CONTENT_COLLAPSED_Y_PERCENT, duration: MotionDuration.Collapse, ease: MotionEase.McOut },
    0,
  );
  timeline.to(shell, { opacity: 0, duration: MotionDuration.Collapse, ease: MotionEase.McOut }, 0);
  timeline.eventCallback("onComplete", () => {
    activeTimelines.delete(shell);
    onCollapsed();
  });
  activeTimelines.set(shell, timeline);
  return timeline;
}
