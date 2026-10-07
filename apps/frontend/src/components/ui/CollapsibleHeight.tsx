import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { MotionDuration } from "@/lib/motion/constants";
import { MC_OUT_CSS_EASING, prefersReducedMotion } from "@/lib/motion/setup";
import { cn } from "@/lib/utils";

/** {@link MotionDuration.Collapse} in milliseconds, the unit `element.animate` takes. */
const COLLAPSE_DURATION_MS = MotionDuration.Collapse * 1000;

/**
 * A region that opens and closes by animating its own height, so the card around
 * it grows and shrinks with it and the layout below follows.
 *
 * The content is mounted from the first render on and collapsed to a height of 0,
 * so the frame of the click changes a height and builds nothing. The first
 * frames of an opening are the expensive ones, because the steep curve reveals
 * most of the content there and it has to be painted. The height runs on the
 * browser's own animation timeline
 * (`element.animate`) rather than through script on every frame, from the height
 * the region shows at that moment to its target, over
 * {@link MotionDuration.Collapse} with the app-wide curve. A toggle while an
 * animation runs therefore reverses from where it is, without a snap.
 *
 * Compare {@link import("./CollapsibleSection").CollapsibleSection}, which keeps
 * the layout still and reveals its content with transforms: the right trade-off
 * for sections that open on their own during a resolve, where the card does not
 * have to grow along with them.
 *
 * The first render, a state that changes before the region has been painted (a
 * persisted disclosure restored after hydration), and reduced motion land in the
 * end state without an animation.
 *
 * Accessibility: while collapsed the region is `inert`, which takes the content
 * out of the tab order and the accessibility tree; pair the trigger's
 * `aria-controls` with this region's {@link id}.
 *
 * @param id - Optional id for the region (the trigger's `aria-controls` target).
 * @param expanded - Whether the region is open; toggling plays the transition.
 * @param className - Classes for the inner content element (padding/gap/flow).
 * @param children - The collapsible content.
 */
export function CollapsibleHeight({
  id,
  expanded,
  className,
  children,
}: {
  id?: string;
  expanded: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The height the server renders. It never changes, so React writes it once and
  // leaves the inline height to the effect below, which has to read the height
  // the region shows before it sets a new one.
  const [initialHeight] = useState(() => (expanded ? undefined : "0px"));
  /** The state whose height the region holds or is animating towards. */
  const appliedRef = useRef(expanded);
  const animationRef = useRef<Animation | null>(null);
  /** Whether the region has been painted; a change before that is a restore, not a toggle. */
  const paintedRef = useRef(false);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      paintedRef.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    const region = ref.current;
    if (!region || appliedRef.current === expanded) return;
    appliedRef.current = expanded;

    // Read before anything changes: mid-animation this is the animated height.
    const fromHeight = region.getBoundingClientRect().height;
    animationRef.current?.cancel();
    animationRef.current = null;
    // The inline value is the end state; the animation plays over it and drops away
    // when it finishes, leaving an open region at `auto` so its content can still
    // change size.
    region.style.height = expanded ? "auto" : "0px";
    if (!paintedRef.current || prefersReducedMotion() || typeof region.animate !== "function") return;

    const toHeight = expanded ? region.scrollHeight : 0;
    const animation = region.animate([{ height: `${fromHeight}px` }, { height: `${toHeight}px` }], {
      duration: COLLAPSE_DURATION_MS,
      easing: MC_OUT_CSS_EASING,
    });
    animationRef.current = animation;
    animation.onfinish = () => {
      if (animationRef.current === animation) animationRef.current = null;
    };
  }, [expanded]);

  return (
    <div
      ref={ref}
      id={id}
      className="overflow-hidden"
      style={{ height: initialHeight }}
      inert={expanded ? undefined : true}
    >
      {/* Its own compositing layer: the content is painted once and moved, instead
          of being painted into the growing card on every frame of the opening.
          Measured in Safari on the iPad simulator, the first frames of an opening
          drop from 25-32 ms to 17-24 ms. */}
      <div className={cn("will-change-transform", className)}>{children}</div>
    </div>
  );
}
