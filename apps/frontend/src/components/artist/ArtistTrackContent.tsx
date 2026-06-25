import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useLayoutEffect, useRef, useState } from "react";
import { ArtistTrackView } from "@/components/artist/ArtistTrackView";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { TrackListView } from "@/hooks/useTrackListView";
import { MotionDuration, MotionEase } from "@/lib/motion/constants";
import { prefersReducedMotion, setupMotion } from "@/lib/motion/setup";

/** Duration of the list↔grid slide. */
const SLIDE_DURATION = MotionDuration.Grid;

/** The view sliding OUT during a switch, plus the direction and the height to glide from. */
interface OutgoingSlide {
  view: TrackListView;
  /** Switching to grid moves content left; to list, right. */
  toGrid: boolean;
  /** The viewport height before the switch, glided to the new view's height. */
  height: number;
}

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
 * the grid enters from the right, and switching back reverses it. The viewport
 * height glides between the two layouts so the sections below never jump.
 *
 * Only the live {@link ArtistTrackView} is mounted at rest; during a switch the
 * outgoing view is briefly mounted as an absolute overlay and both are tweened.
 * Reduced motion skips the slide (a hard switch).
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
  const previousViewRef = useRef(view);
  const [outgoing, setOutgoing] = useState<OutgoingSlide | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const incomingRef = useRef<HTMLDivElement>(null);
  const outgoingRef = useRef<HTMLDivElement>(null);

  // Arm a slide when the view changes — in a layout effect (before paint) so the
  // new view is never shown at rest for a frame before the slide starts.
  useLayoutEffect(() => {
    const previous = previousViewRef.current;
    if (previous === view) return;
    previousViewRef.current = view;
    if (prefersReducedMotion()) return;
    const height = Math.round(viewportRef.current?.getBoundingClientRect().height ?? 0);
    setOutgoing({ view: previous, toGrid: view === TrackListView.Grid, height });
  }, [view]);

  // Run the slide once both layers are mounted.
  useGSAP(
    () => {
      if (!outgoing) return;
      setupMotion();
      const incoming = incomingRef.current;
      const out = outgoingRef.current;
      const viewport = viewportRef.current;
      const sign = outgoing.toGrid ? 1 : -1;
      if (incoming) {
        gsap.fromTo(
          incoming,
          { xPercent: sign * 100 },
          { xPercent: 0, duration: SLIDE_DURATION, ease: MotionEase.McOut },
        );
      }
      if (out) {
        gsap.fromTo(out, { xPercent: 0 }, { xPercent: -sign * 100, duration: SLIDE_DURATION, ease: MotionEase.McOut });
      }
      if (viewport) {
        const to = Math.round(incoming?.getBoundingClientRect().height ?? outgoing.height);
        if (Math.abs(to - outgoing.height) > 1) {
          gsap.fromTo(
            viewport,
            { height: outgoing.height },
            { height: to, duration: SLIDE_DURATION, ease: MotionEase.McOut, clearProps: "height" },
          );
        }
      }
      const done = gsap.delayedCall(SLIDE_DURATION, () => setOutgoing(null));
      return () => {
        done.kill();
      };
    },
    { dependencies: [outgoing] },
  );

  return (
    <div ref={viewportRef} className="relative overflow-hidden">
      {outgoing && (
        <div ref={outgoingRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
          <ArtistTrackView view={outgoing.view} items={items} cardSignal={cardSignal} />
        </div>
      )}
      <div ref={incomingRef}>
        <ArtistTrackView
          view={view}
          items={items}
          cardSignal={cardSignal}
          onTrackResolve={onTrackResolve}
          onResolveStart={onResolveStart}
        />
      </div>
    </div>
  );
}
