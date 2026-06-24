import { useGSAP } from "@gsap/react";
import type { ArtistInfoResponse } from "@musiccloud/shared";
import { useRef } from "react";
import { ArtistProfileDesktopCard } from "@/components/artist/ArtistProfileDesktopCard";
import { ArtistTrackListCard } from "@/components/artist/ArtistTrackListCard";
import type {
  ArtistCardLabels,
  ArtistInfoStatus,
  ArtistPanelTrackResolveHandler,
} from "@/components/artist/artistPanelTypes";
import { buildSimilarSwapKey, buildTracksSwapKey } from "@/components/artist/artistSwapKeys";
import { toPopularTrackItems, toSimilarTrackItems } from "@/components/artist/artistTrackItems";
import { EventsCard } from "@/components/artist/EventsCard";
import { SimilarArtistsSkeleton } from "@/components/artist/SimilarArtistsSkeleton";
import { TracksSkeleton } from "@/components/artist/TracksSkeleton";
import { CardSignal } from "@/lib/analytics/umami";
import { animateFlipFrom, type CapturedFlipState, captureFlipState } from "@/lib/motion/flip";

interface AnimatedArtistColumnProps {
  /** Latest artist-info payload, or `null` while the client-side fetch is still loading. */
  artistData: ArtistInfoResponse | null;
  /** Load phase of the artist-info fetch; drives both the card content and the flip trigger. */
  artistLoadStatus: ArtistInfoStatus;
  /** `true` while the fetch is in flight and no data has arrived yet (cards show skeletons). */
  isLoading: boolean;
  /** The four artist-column section titles, supplied by the presentation owner. */
  labels: ArtistCardLabels;
  /** Lifts the "resolve started" moment so the VFD flips to loading in sync with the spinning disc. */
  onArtistResolveStart: () => void;
  /** Resolves a clicked popular/similar track into a new share view. */
  onTrackResolve: ArtistPanelTrackResolveHandler;
  /** ISO 3166-1 alpha-2 region used to localize the events card. */
  userRegion: string;
  /** Column width in px — must match the artist grid track in `DesktopShareLayout`. */
  widthPx: number;
}

/**
 * Desktop artist-info column: the four stacked artist cards (profile, popular
 * tracks, events, similar artists) plus a GSAP Flip that softens their
 * skeleton→content transition with a compositor-only glide.
 *
 * The cards are fetched client-side after the share card has already rendered
 * (`ShareLayout` fires the request post-SSR). When the fetch resolves, each
 * card swaps its fixed-height skeleton for variable-height content — and three
 * of them unmount entirely on empty data (`return null`). In a plain
 * `flex flex-col` that snaps every following card downward/upward, which is
 * the desktop hydration layout shift diagnosed in plan MC-029 Task 1.4.
 *
 * Scope (measured, plan MC-029 Task 2.6): the flip is a motion POLISH — the
 * cards glide instead of snapping — and reduces the shift only marginally
 * (measured CLS 0.0568 → 0.049 on a content-rich artist). It does NOT bring CLS
 * to ~0. A transform-flip masks the MOVEMENT of known elements (the case of
 * Task 2.2's grid reflow and Task 2.4's double-buffer swap); here four cards of
 * unknown, independently-varying height replace fixed skeletons in a vertical
 * stack, which a single flip cannot fully invert. The CLS is pre-existing (not
 * a regression of the GSAP migration — Task 1.4 proved cold-load = SPA). Driving
 * it to ~0 needs space reservation, deliberately out of scope here.
 *
 * Animation model (same container-flip as `AnimatedPlatformGrid`, minus the
 * mount entrance):
 * - Every status change captures the just-committed layout into a ref and
 *   animates FROM the previous snapshot: persisting cards glide to their new
 *   spots, entering cards fade+scale in, and the column's own height change is
 *   scale-animated — its layout height changes exactly once at commit, never
 *   per frame (compositor-only, no `height` tween).
 * - The first run only seeds the snapshot and plays NO entrance: the cards are
 *   SSR-rendered and hydrated in place, so an entrance would flicker. This is
 *   the deliberate difference from `AnimatedPlatformGrid`, whose tiles do play
 *   a first-mount entrance.
 * - Cards unmounted by React (empty sections) cannot be animated out and
 *   simply disappear; the cards below them glide up to close the gap.
 * - Reduced motion: the flip helpers skip every tween — the DOM already shows
 *   the resolved layout after commit (see `lib/motion/flip.ts`).
 *
 * Snapshot freshness: the trigger is `artistLoadStatus`, which does not change
 * during the internal placeholder→skeleton step (`useSkeletonAllowed` in
 * `hooks/useSkeletonAllowed.ts`, 300 ms).
 * That step is shift-free by design — the cards' `min-h` placeholders are sized
 * to the skeleton heights — so the loading snapshot captured at mount stays a
 * faithful "before" for the resolve flip even when the skeleton phase is shown.
 */
export function AnimatedArtistColumn({
  artistData,
  artistLoadStatus,
  isLoading,
  labels,
  onArtistResolveStart,
  onTrackResolve,
  userRegion,
  widthPx,
}: AnimatedArtistColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const previousFlipStateRef = useRef<CapturedFlipState | null>(null);

  useGSAP(
    () => {
      const column = columnRef.current;
      if (!column) return;
      const cards = Array.from(column.children);
      const targets = [column, ...cards];
      const previousState = previousFlipStateRef.current;
      // Capture BEFORE animating: this run's committed layout becomes the
      // "before" of the NEXT reflow, and capturing force-completes any
      // in-flight flip (so measurement stays untransformed). Order is
      // load-bearing — see `captureFlipState` in lib/motion/flip.ts.
      previousFlipStateRef.current = captureFlipState(targets);
      if (previousState) {
        // Only the cards go position:absolute during the flip; the column
        // stays in flow so Flip can lock its layout height while the visual
        // size change is scale-animated (same split as AnimatedPlatformGrid).
        animateFlipFrom(previousState, { targets, absolute: cards });
      }
    },
    { scope: columnRef, dependencies: [artistLoadStatus] },
  );

  // Resolve the loading presentation once for the track cards: first load shows
  // the skeleton, a refetch with data on screen blurs + spins (mirrors the cards'
  // former internal derivation, now hoisted so they stay pure presentation).
  const showInitialSkeleton = isLoading && !artistData;
  const isRefreshing = isLoading && !!artistData;

  return (
    <div ref={columnRef} className="flex flex-col gap-6" style={{ width: `${widthPx}px` }}>
      <ArtistProfileDesktopCard
        title={labels.profile}
        providedBy={labels.profileProvidedBy}
        data={artistData}
        isLoading={isLoading}
        status={artistLoadStatus}
      />
      <ArtistTrackListCard
        title={labels.popularTracks}
        items={toPopularTrackItems(artistData)}
        showInitialSkeleton={showInitialSkeleton}
        isRefreshing={isRefreshing}
        Skeleton={TracksSkeleton}
        swapKey={buildTracksSwapKey(artistData)}
        placeholderHeightClass="min-h-[186px]"
        onTrackResolve={onTrackResolve}
        onResolveStart={onArtistResolveStart}
      />
      <EventsCard title={labels.events} data={artistData} isLoading={isLoading} userRegion={userRegion} />
      <ArtistTrackListCard
        title={labels.similar}
        items={toSimilarTrackItems(artistData)}
        showInitialSkeleton={showInitialSkeleton}
        isRefreshing={isRefreshing}
        Skeleton={SimilarArtistsSkeleton}
        swapKey={buildSimilarSwapKey(artistData)}
        placeholderHeightClass="min-h-[205px]"
        cardSignal={CardSignal.SimilarArtist}
        onTrackResolve={onTrackResolve}
        onResolveStart={onArtistResolveStart}
      />
    </div>
  );
}
