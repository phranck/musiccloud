import { useGSAP } from "@gsap/react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { buildCollapseTimeline, buildExpandTimeline } from "@/lib/motion/collapse";
import { cn } from "@/lib/utils";

/**
 * Tailwind's `max-sm` range — the viewports on which sections with
 * `disableMobileCollapse` never animate (one-shot `matchMedia` read at
 * trigger time, mirroring the former `max-sm:` class overrides). Kept in
 * `rem` like Tailwind v4's breakpoints (`sm` = 40rem): a px-based query
 * would diverge from the CSS breakpoint when the user changes the
 * browser's root font size.
 */
const MOBILE_COLLAPSE_DISABLE_QUERY = "(width < 40rem)";

/**
 * Reports whether the viewport is currently in the `max-sm` range. Returns
 * `false` outside a browser context (SSR renders the static open/closed
 * state anyway).
 */
function isMobileViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(MOBILE_COLLAPSE_DISABLE_QUERY).matches;
}

/**
 * A section that animates open/closed compositor-only via the curtain-reveal
 * timelines in `lib/motion/collapse.ts` (GSAP port of the former
 * `grid-template-rows` CSS transition, which ran a layout pass per frame —
 * plan MC-029 Phase-2 gate blocker). Used in MediaCard/MediaSummaryCard and
 * the artist cards for collapsible preview/share/platforms/profile sections.
 *
 * Element roles (see the factory module doc): the outer div is the
 * stationary clipping `shell` (one-shot layout height change, opacity fade),
 * the middle div the translated `curtain` clip window, the inner div the
 * counter-translated `content`. Layout semantics follow Task 2.4: following
 * siblings reposition once at the expand commit / collapse unmount instead
 * of gliding per frame.
 *
 * Children lifecycle: `renderedChildren` snapshots the children so the OLD
 * content stays visible while a collapse plays (consumers null their
 * children together with `visible`); the collapse timeline's `onCollapsed`
 * unmounts it (replacing the former `setTimeout`). The sync runs in a
 * layout effect, so an expanding section mounts its children and starts the
 * curtain pre-paint in the same frame.
 *
 * `disableMobileCollapse` keeps the former `max-sm:` semantics: below the
 * `sm` breakpoint such sections never animate — they open instantly and
 * close instantly (the old implementation also never animated there; it
 * merely kept the content visible until its unmount timeout fired).
 *
 * Reduced motion is handled inside the factories (instant open/close).
 */
export function CollapsibleSection({
  disableMobileCollapse = false,
  visible,
  sectionClass,
  children,
}: {
  /** Never animate (open/close instantly) below the `sm` breakpoint — former `max-sm:` override semantics. */
  disableMobileCollapse?: boolean;
  /** Whether the section is open; toggling plays the expand/collapse transition. */
  visible: boolean;
  /**
   * Extra classes for the inner content element. Constraint: padding-only
   * spacing (as all current consumers use). The ±100% counter-translation
   * assumes curtain and content have the same height — a margin on the
   * content would make them diverge and the content would visibly drift
   * mid-flight instead of standing still.
   */
  sectionClass?: string;
  /** Section content; snapshotted during a collapse so the old content stays visible until unmount. */
  children: ReactNode;
}) {
  const [renderedChildren, setRenderedChildren] = useState<ReactNode>(() => (visible ? children : null));
  const shellRef = useRef<HTMLDivElement>(null);
  const curtainRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /** Last direction the section settled towards; gates the transition detection below. */
  const wasOpenRef = useRef(visible);
  /** Whether children were mounted before the current commit (fresh expand vs. resume detection). */
  const hadChildrenRef = useRef(renderedChildren !== null);

  // Children sync (pre-paint): adopt new children while visible; keep the
  // last snapshot during a collapse so the old content stays visible until
  // the timeline unmounts it.
  useLayoutEffect(() => {
    if (visible) setRenderedChildren(children);
  }, [visible, children]);

  const hasRenderedChildren = renderedChildren !== null;

  useGSAP(
    () => {
      const shell = shellRef.current;
      const curtain = curtainRef.current;
      const content = contentRef.current;
      const wasOpen = wasOpenRef.current;
      const hadChildren = hadChildrenRef.current;
      hadChildrenRef.current = hasRenderedChildren;

      if (!shell) return;

      if (visible && !wasOpen && hasRenderedChildren && curtain && content) {
        wasOpenRef.current = true;
        buildExpandTimeline({
          shell,
          curtain,
          content,
          // Children mounted in this commit = settled-closed start; children
          // already present = this expand interrupts a running collapse and
          // resumes from its current values.
          fromCollapsed: !hadChildren,
          instant: disableMobileCollapse && isMobileViewport(),
        });
        return;
      }

      if (!visible && wasOpen && hasRenderedChildren && curtain && content) {
        wasOpenRef.current = false;
        const unmountChildren = () => setRenderedChildren(null);
        const timeline = buildCollapseTimeline({
          shell,
          curtain,
          content,
          onCollapsed: unmountChildren,
          instant: disableMobileCollapse && isMobileViewport(),
        });
        // Instant/reduced paths return null without firing the callback; the
        // close must not depend on an animation playing.
        if (!timeline) unmountChildren();
      }
    },
    { dependencies: [disableMobileCollapse, hasRenderedChildren, visible] },
  );

  return (
    <div ref={shellRef} className="overflow-hidden">
      {hasRenderedChildren && (
        <div ref={curtainRef} className="overflow-hidden">
          <div ref={contentRef} className={cn(sectionClass)}>
            {renderedChildren}
          </div>
        </div>
      )}
    </div>
  );
}
