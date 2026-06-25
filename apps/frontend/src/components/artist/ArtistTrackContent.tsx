import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useLayoutEffect, useRef, useState } from "react";
import { ArtistTrackView } from "@/components/artist/ArtistTrackView";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { raisedControlRadius } from "@/components/cards/cardGeometry";
import { TrackListView } from "@/hooks/useTrackListView";
import { prefersReducedMotion } from "@/lib/motion/setup";

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
/**
 * How much of the last row is kept clipped below the fold, in px. Trimmed off the
 * grid-anchor height so both views show a partially cut final row — a standing
 * scroll affordance that signals "there's more, scroll for it".
 */
const SCROLL_PEEK_PX = 30;

/** The view sliding OUT during a switch, plus its direction. */
interface OutgoingSlide {
  view: TrackListView;
  /** Switching to grid moves content left; to list, right. */
  toGrid: boolean;
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
 * the grid enters from the right, and switching back reverses it.
 *
 * The card height is fixed to the grid layout's height and never changes on a
 * toggle: an invisible grid view in normal flow sets the height, and the visible
 * views are layered absolutely on top and fill it (the list scrolls within it).
 * Both layers move with `transform` on a GPU layer (`force3D` + `will-change`),
 * which keeps the slide smooth.
 *
 * Only the anchor and the live view are mounted at rest; during a switch the
 * outgoing view is briefly mounted as a second absolute layer and both are tweened.
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
  const incomingRef = useRef<HTMLDivElement>(null);
  const outgoingRef = useRef<HTMLDivElement>(null);

  // Arm a slide when the view changes — in a layout effect (before paint) so the
  // new view is never shown at rest for a frame before the slide starts.
  useLayoutEffect(() => {
    const previous = previousViewRef.current;
    if (previous === view) return;
    previousViewRef.current = view;
    if (prefersReducedMotion()) return;
    setOutgoing({ view: previous, toGrid: view === TrackListView.Grid });
  }, [view]);

  // Run the slide once both layers are mounted.
  useGSAP(
    () => {
      if (!outgoing) return;
      const incoming = incomingRef.current;
      const out = outgoingRef.current;
      const sign = outgoing.toGrid ? 1 : -1;
      if (incoming) {
        gsap.fromTo(
          incoming,
          { xPercent: sign * 100 },
          { xPercent: 0, duration: SLIDE_DURATION, ease: SLIDE_EASE, force3D: true },
        );
      }
      if (out) {
        gsap.fromTo(
          out,
          { xPercent: 0 },
          { xPercent: -sign * 100, duration: SLIDE_DURATION, ease: SLIDE_EASE, force3D: true },
        );
      }
      const done = gsap.delayedCall(SLIDE_DURATION, () => setOutgoing(null));
      return () => {
        done.kill();
      };
    },
    { dependencies: [outgoing] },
  );

  return (
    // Round-clip the slide viewport itself, on its own compositing layer
    // (transform-gpu). The well's border-radius alone fails to clip the slide:
    // the layers run on GPU layers (force3D + will-change) that escape an
    // ancestor's border-radius unless the clipping box is itself a GPU layer.
    // The radius matches the rows'/tiles' promoted outer corner (raisedControlRadius).
    <div className="relative overflow-hidden transform-gpu" style={{ borderRadius: raisedControlRadius }}>
      {/* Height anchor: an invisible grid view in normal flow gives the card the
          grid layout's height, so toggling never changes the height — only a
          horizontal slide. The visible views layer absolutely on top and fill it.
          The negative bottom margin trims SCROLL_PEEK_PX so the last row stays
          clipped in both views, signalling that the content scrolls. */}
      <div aria-hidden="true" className="invisible" style={{ marginBottom: `-${SCROLL_PEEK_PX}px` }}>
        <ArtistTrackView view={TrackListView.Grid} items={items} />
      </div>
      {outgoing && (
        <div
          ref={outgoingRef}
          className="pointer-events-none absolute inset-0 will-change-transform"
          aria-hidden="true"
        >
          <ArtistTrackView view={outgoing.view} items={items} cardSignal={cardSignal} fillHeight />
        </div>
      )}
      <div ref={incomingRef} className="absolute inset-0">
        <ArtistTrackView
          view={view}
          items={items}
          cardSignal={cardSignal}
          fillHeight
          onTrackResolve={onTrackResolve}
          onResolveStart={onResolveStart}
        />
      </div>
    </div>
  );
}
