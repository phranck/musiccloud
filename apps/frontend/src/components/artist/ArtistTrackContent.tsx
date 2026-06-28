import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { ArtistTrackView } from "@/components/artist/ArtistTrackView";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { raisedControlRadius } from "@/components/cards/cardGeometry";
import { TrackListView } from "@/hooks/useTrackListView";
import { MotionDuration, MotionEase } from "@/lib/motion/constants";
import { prefersReducedMotion } from "@/lib/motion/setup";
import { cn } from "@/lib/utils";

/**
 * Duration (seconds) of the list↔grid slide. A whole-view move needs more room
 * to read than a control reflow, but stays brisk enough not to feel sluggish.
 */
const SLIDE_DURATION = 0.85;
/**
 * Symmetric acceleration curve (ramp up, ramp down) so the view reads as one
 * object gliding across. The front-loaded control ease makes a large translate
 * look like it snaps then drifts, which reads as "too fast".
 */
const SLIDE_EASE = "power2.inOut";

/** The two presentations, in toggle order (list left, grid right). */
const LAYER_VIEWS = [TrackListView.List, TrackListView.Grid] as const;

interface ArtistTrackContentProps {
  /** Which presentation to render. */
  view: TrackListView;
  /** Normalized rows to render (already filtered by the owner). */
  items: ArtistTrackItem[];
  /** Analytics signal forwarded to each cell. */
  cardSignal?: string;
  /** In-place resolve handler forwarded to each cell. */
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  /** Optional callback fired right before a cell begins resolving. */
  onResolveStart?: () => void;
}

/**
 * The artist-track presentation host shared by the desktop card and the mobile
 * section. Treats the list and the grid as two whole objects and slides between
 * them horizontally on a view switch: the list sits left and the grid right (as
 * in the toggle), so switching to the grid pushes the list out to the left while
 * the grid enters from the right, and switching back reverses it.
 *
 * Both views are permanently mounted as absolute layers: the active one rests at
 * x=0, the other waits just off-screen, and a switch tweens their transforms.
 * Keeping both mounted is what stops the covers from flickering — a switch never
 * remounts a view, so its `<img>`s never repaint. The card height wraps the ACTIVE
 * view exactly — driven by an invisible in-flow copy of it, capped per view in
 * {@link ArtistTrackView} (4.5 list rows / 2.5 grid tile rows) — so a switch changes
 * the height; that change is tweened FIRST (the card growing or shrinking into its
 * new content), THEN the layers slide across. The viewport round-clips on its own GPU
 * layer so the slide holds the card's corners. Reduced motion snaps without tweening.
 *
 * @param props - {@link ArtistTrackContentProps}.
 */
export function ArtistTrackContent({
  view,
  items,
  cardSignal,
  onTrackResolve,
  onResolveStart,
}: ArtistTrackContentProps) {
  const clipRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // The previously positioned view; null until the first run. Drives whether a
  // view change snaps (first paint / no change) or tweens (a real switch).
  const prevViewRef = useRef<TrackListView | null>(null);
  // The card's content height measured on the previous run; a switch animates the
  // clip's height from it to the new content height. Null until the first run.
  const prevHeightRef = useRef<number | null>(null);

  // Position both layers from `view`: the active view rests at 0, the other waits
  // off-screen (list left, grid right). The first run and reduced motion snap;
  // a real switch tweens. Both layers stay mounted throughout.
  useGSAP(
    () => {
      const clipEl = clipRef.current;
      const listEl = listRef.current;
      const gridEl = gridRef.current;
      if (!clipEl || !listEl || !gridEl) return;
      const toGrid = view === TrackListView.Grid;
      const listX = toGrid ? -100 : 0;
      const gridX = toGrid ? 0 : 100;
      // Measure the height this commit produced; the previous run's height is the
      // "from" for the height tween below.
      const oldH = prevHeightRef.current;
      const newH = clipEl.getBoundingClientRect().height;
      prevHeightRef.current = newH;
      const animate = prevViewRef.current !== null && prevViewRef.current !== view && !prefersReducedMotion();
      prevViewRef.current = view;
      if (animate) {
        // A serial two-beat — the card resizes, THEN the views slide — so the growing
        // or shrinking card settles before the horizontal swap reads.
        // 1. Height: tween the card's height from the old content height to the new
        //    one. A real height tween keeps the layout honest — neighbours follow and
        //    there is no visual/layout gap (which a scaleY/FLIP leaves on a grow, since
        //    the transform's layout box doesn't change). For this infrequent toggle of
        //    a small card the per-frame reflow is cheap — the documented
        //    CollapsibleHeight exception to the compositor-only policy.
        const resizes = oldH !== null && Math.abs(oldH - newH) > 1;
        if (resizes) {
          gsap.fromTo(
            clipEl,
            { height: oldH },
            { height: newH, duration: MotionDuration.Grid, ease: MotionEase.McOut, clearProps: "height" },
          );
        }
        // 2. Slide: once the height has settled, the list/grid layers glide across.
        const slideDelay = resizes ? MotionDuration.Grid : 0;
        gsap.to(listEl, {
          xPercent: listX,
          duration: SLIDE_DURATION,
          ease: SLIDE_EASE,
          force3D: true,
          delay: slideDelay,
        });
        gsap.to(gridEl, {
          xPercent: gridX,
          duration: SLIDE_DURATION,
          ease: SLIDE_EASE,
          force3D: true,
          delay: slideDelay,
        });
      } else {
        gsap.set(listEl, { xPercent: listX });
        gsap.set(gridEl, { xPercent: gridX });
      }
    },
    { dependencies: [view] },
  );

  return (
    // Round-clip the slide viewport itself, on its own compositing layer
    // (transform-gpu). The well's border-radius alone fails to clip the slide:
    // the layers run on GPU layers (force3D) that escape an ancestor's
    // border-radius unless the clipping box is itself a GPU layer. The radius
    // matches the rows'/tiles' promoted outer corner (raisedControlRadius).
    <div ref={clipRef} className="relative overflow-hidden transform-gpu" style={{ borderRadius: raisedControlRadius }}>
      {/* Height spacer: an invisible copy of the ACTIVE view in normal flow gives the
          card exactly that view's (capped) height, so the card wraps its content and
          its height changes on a list↔grid switch. The visible views layer absolutely
          on top and fill it; the cap (4.5 rows / 2.5 tiles) already leaves the
          half-row scroll peek, so no margin trim is needed. */}
      <div ref={spacerRef} aria-hidden="true" className="invisible">
        <ArtistTrackView view={view} items={items} />
      </div>
      {LAYER_VIEWS.map((v) => {
        const active = v === view;
        return (
          <div
            key={v}
            ref={v === TrackListView.List ? listRef : gridRef}
            className={cn("absolute inset-0", !active && "pointer-events-none")}
            aria-hidden={!active || undefined}
          >
            <ArtistTrackView
              view={v}
              items={items}
              cardSignal={cardSignal}
              fillHeight
              onTrackResolve={active ? onTrackResolve : undefined}
              onResolveStart={active ? onResolveStart : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
