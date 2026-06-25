import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { ArtistTrackView } from "@/components/artist/ArtistTrackView";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { raisedControlRadius } from "@/components/cards/cardGeometry";
import { TrackListView } from "@/hooks/useTrackListView";
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
/**
 * How much of the last row is kept clipped below the fold, in px. Trimmed off the
 * grid-anchor height so both views show a partially cut final row — a standing
 * scroll affordance that signals "there's more, scroll for it".
 */
const SCROLL_PEEK_PX = 30;

/**
 * Minimum card height: 4.5 list rows plus 3 inter-row gaps. A short artist (few
 * popular/similar tracks) would otherwise collapse the card to one grid row; pin
 * it to this floor so the toggleable track cards keep a consistent,
 * scroll-affording size.
 *
 * Derived from the row geometry (not a magic height): one row is the 48px (`3rem`)
 * cover plus its top/bottom `--mc-pad-track`; the gap is `--mc-gap-list`. So a
 * spacing-token change re-sizes the floor concentrically.
 */
const MIN_CARD_HEIGHT = "calc(4.5 * (3rem + 2 * var(--mc-pad-track, 0.25rem)) + 3 * var(--mc-gap-list, 0.125rem))";

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
 * x=0, the other waits just off-screen, and a switch only tweens their transforms.
 * Keeping both mounted is what stops the covers from flickering — a switch never
 * remounts a view, so its `<img>`s never repaint. The card height is fixed to the
 * grid layout via an invisible in-flow grid anchor (the list scrolls within it),
 * and the viewport round-clips on its own GPU layer so the slide holds the card's
 * corners. Reduced motion snaps without tweening.
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
  const listRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // The previously positioned view; null until the first run. Drives whether a
  // view change snaps (first paint / no change) or tweens (a real switch).
  const prevViewRef = useRef<TrackListView | null>(null);

  // Position both layers from `view`: the active view rests at 0, the other waits
  // off-screen (list left, grid right). The first run and reduced motion snap;
  // a real switch tweens. Both layers stay mounted throughout.
  useGSAP(
    () => {
      const listEl = listRef.current;
      const gridEl = gridRef.current;
      if (!listEl || !gridEl) return;
      const toGrid = view === TrackListView.Grid;
      const listX = toGrid ? -100 : 0;
      const gridX = toGrid ? 0 : 100;
      const animate = prevViewRef.current !== null && prevViewRef.current !== view && !prefersReducedMotion();
      prevViewRef.current = view;
      if (animate) {
        gsap.to(listEl, { xPercent: listX, duration: SLIDE_DURATION, ease: SLIDE_EASE, force3D: true });
        gsap.to(gridEl, { xPercent: gridX, duration: SLIDE_DURATION, ease: SLIDE_EASE, force3D: true });
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
    <div
      className="relative overflow-hidden transform-gpu"
      style={{ borderRadius: raisedControlRadius, minHeight: MIN_CARD_HEIGHT }}
    >
      {/* Height anchor: an invisible grid view in normal flow gives the card the
          grid layout's height, so toggling never changes the height — only a
          horizontal slide. The visible views layer absolutely on top and fill it.
          The negative bottom margin trims SCROLL_PEEK_PX so the last row stays
          clipped in both views, signalling that the content scrolls. */}
      <div aria-hidden="true" className="invisible" style={{ marginBottom: `-${SCROLL_PEEK_PX}px` }}>
        <ArtistTrackView view={TrackListView.Grid} items={items} />
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
