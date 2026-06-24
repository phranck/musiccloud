import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { MotionDuration, MotionEase } from "@/lib/motion/constants";
import { prefersReducedMotion, setupMotion } from "@/lib/motion/setup";
import { cn } from "@/lib/utils";

/**
 * A region that collapses and expands its real layout height in sync with its
 * content — the classic accordion. It tweens `height` with GSAP over
 * {@link MotionDuration.Collapse} and the app-wide {@link MotionEase.McOut} ease,
 * so the height shrinks frame-by-frame and following siblings move together with
 * the content as it disappears.
 *
 * Contrast with {@link import("./CollapsibleSection").CollapsibleSection}'s
 * compositor-only curtain reveal: that one keeps the surrounding layout still and
 * reflows exactly once (at the expand commit / collapse unmount) to avoid
 * per-frame layout — the right trade-off for the frequently animated media/artist
 * sections. For an explicit, infrequent user toggle the per-frame layout cost is
 * irrelevant, and a height that lags behind the vanishing content reads as broken;
 * this component is for that case.
 *
 * Lifecycle: the content is mounted only while open or while a collapse is still
 * playing (it unmounts on the collapse's `onComplete`). A collapsed section
 * therefore renders nothing — no first-paint flash, and no off-screen content in
 * the SSR markup. A fresh expand seeds height 0 pre-paint so it animates up from
 * nothing; an interrupting toggle resumes from the current height (no snap).
 * Reduced motion and the first render land in the end state instantly.
 *
 * Accessibility: while collapsed the clip wrapper is `inert`, so the hidden
 * content is removed from the tab order and the accessibility tree; pair the
 * trigger's `aria-controls` with this region's {@link id}.
 *
 * @param id - Optional id for the clip wrapper (the trigger's `aria-controls` target).
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
  // Independent lifecycle flag — deliberately not seeded from `expanded`: content
  // mounts when opening (via the effect below) and stays mounted through a
  // collapse, unmounting only on its completion. Starting at `false` also keeps a
  // collapsed section out of the SSR markup (no first-paint flash).
  const [mounted, setMounted] = useState(false);
  /** Whether the upcoming GSAP run is the first (no entrance animation on mount). */
  const firstRun = useRef(true);
  /** Whether content was already in the DOM before this commit (fresh expand vs. resume). */
  const hadContent = useRef(false);

  // Mount content pre-paint when opening, so a fresh expand animates up from 0.
  useLayoutEffect(() => {
    if (expanded) setMounted(true);
  }, [expanded]);

  useGSAP(
    () => {
      const el = ref.current;
      const isFirst = firstRun.current;
      firstRun.current = false;
      const hadChildren = hadContent.current;
      hadContent.current = mounted;
      if (!el) return;
      setupMotion();

      // First render and reduced motion land in the end state with no tween.
      if (isFirst || prefersReducedMotion()) {
        gsap.set(el, { height: expanded ? "auto" : 0 });
        if (!expanded) setMounted(false);
        return;
      }

      if (expanded && mounted) {
        // Fresh expand (content just mounted) seeds the collapsed start; a resume
        // (interrupting a collapse, content still present) keeps the current height.
        if (!hadChildren) gsap.set(el, { height: 0 });
        gsap.to(el, { height: "auto", duration: MotionDuration.Collapse, ease: MotionEase.McOut, overwrite: true });
        return;
      }

      if (!expanded && mounted) {
        gsap.to(el, {
          height: 0,
          duration: MotionDuration.Collapse,
          ease: MotionEase.McOut,
          overwrite: true,
          onComplete: () => setMounted(false),
        });
      }
    },
    { dependencies: [expanded, mounted] },
  );

  return (
    <div ref={ref} id={id} className="overflow-hidden" inert={expanded ? undefined : true}>
      {mounted && <div className={cn(className)}>{children}</div>}
    </div>
  );
}
