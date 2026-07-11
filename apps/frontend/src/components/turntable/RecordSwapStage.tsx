import type { VinylLayout, VinylSide } from "@musiccloud/shared";
import { type ReactNode, useEffect, useEffectEvent, useRef, useState } from "react";
import { VinylRecord, type VinylRecordProps } from "@/components/vinyl/VinylRecord";
import { VinylSpinState, type VinylSpinState as VinylSpinStateValue } from "@/components/vinyl/VinylRecord.types";
import { buildRecordSwapTimeline, type RecordSwapHandle } from "@/lib/motion/recordSwap";
import { prefersReducedMotion } from "@/lib/motion/setup";
import { cn } from "@/lib/utils";

/**
 * The vinyl-label fields of a record (no spin state, class or resolved side).
 *
 * The whole persisted layout remains attached to the record through the
 * turntable compound. The hub resolves its current side from the live track
 * title immediately before rendering the presentational {@link VinylRecord}.
 */
export type RecordLabel = Omit<VinylRecordProps, "spinState" | "className" | "sideLayout"> & {
  /** Persisted Discogs layout for the inserted record, if one is available. */
  vinylLayout?: VinylLayout | null;
};

/**
 * The stage's swap phases.
 *
 * - `Idle`: one resting record, no swap in flight.
 * - `PendingCoast`: the record identity changed while the deck was still
 *   spinning; the OLD record stays on the platter and coasts down. The new
 *   record is withheld until the spin settles, so the wind-down reads as "this
 *   record is stopping" rather than "a new record already arrived".
 * - `Sliding`: the coast has finished (spin idle); both records mount and the
 *   arc swap runs (old lifts off and slides out, new slides in and settles).
 */
const SwapPhase = {
  Idle: "idle",
  PendingCoast: "pendingCoast",
  Sliding: "sliding",
} as const;

type SwapPhaseValue = (typeof SwapPhase)[keyof typeof SwapPhase];

/** Props for {@link RecordSwapStage}. */
interface RecordSwapStageProps {
  /** The current record's vinyl-label fields (cover art, title, catalog, ...). */
  record: RecordLabel;
  /** Resolved side for the live track on the inserted record. */
  sideLayout?: VinylSide;
  /** Spin state applied to the settled record (during a swap the incoming is idle). */
  spinState: VinylSpinStateValue;
  /**
   * Identity of the current record. A change triggers the arc swap: the previous
   * record slides out while the new one slides in. Same value = no swap.
   */
  swapKey: string;
  /**
   * Fired once the arc swap has naturally settled (the new record is on the
   * spindle). NOT fired on an interrupted swap, and NOT on the reduced-motion
   * instant path (there the audio continues seamlessly, so nothing needs to be
   * re-triggered). The hub-connected platter uses this to auto-play the new
   * record after it settles.
   */
  onSettled?: () => void;
  /**
   * The disc-centre chrome (the turntable spindle + its contact shadow), supplied
   * as children so it can be inlined at the call site. It sits ABOVE the
   * resting/coasting record — the spindle pokes up through the record's centre
   * hole — but BELOW a record mid-swap, because the record has lifted off the
   * spindle and travels over it. The stage owns this z-order flip so the spindle
   * chrome never floats on top of a lifted disc.
   */
  children?: ReactNode;
  /** Extra classes on the stage wrapper (sizes/positions it over the platter). */
  className?: string;
}

/**
 * Swap animation state. The displayed records are driven ENTIRELY from state, not
 * the live props: the `record`/`swapKey` props flip the instant a new album is
 * clicked, but the state lags them through the choreography, so the spinning disc
 * on screen is never re-keyed mid-spin (which would remount it and snap the rotor
 * angle to 0°). `current` is the resting/incoming disc; `previous` the outgoing one.
 */
interface SwapState {
  /** The current phase of the swap. */
  phase: SwapPhaseValue;
  /** The resting disc (at rest) or the incoming disc (during a swap). */
  current: RecordLabel;
  /** {@link current}'s identity, used as its React key so the instance is stable. */
  currentKey: string;
  /** The outgoing disc's label fields during a swap, or `null` when at rest. */
  previous: RecordLabel | null;
  /** Resolved side shown by the outgoing record at the time it left the platter. */
  previousSideLayout?: VinylSide;
  /**
   * The outgoing disc's identity, used as the React key of the outgoing element.
   * Identity keys make the SAME `VinylRecord` instance carry from resting →
   * outgoing → unmount, so the rotor's live angle never snaps. `null` at rest.
   */
  previousKey: string | null;
  /** Bumped on every swap; guards the settle so a superseded settle is ignored. */
  generation: number;
}

/**
 * Renders the vinyl record on the platter and choreographs the arc swap when the
 * record identity ({@link RecordSwapStageProps.swapKey}) changes.
 *
 * The choreography is coast-gated: a swap that arrives while the deck is spinning
 * does NOT slide immediately. Instead the OLD record stays on the platter and
 * winds down (driven by the live `spinState` handed down from the hub); only once
 * the spin reaches {@link VinylSpinState.Idle} — the end of the deck's coast
 * window — do both records mount and the arc swap run via
 * {@link buildRecordSwapTimeline} (Web Animations API). This matches the accepted
 * choreography "stop the music, the platter coasts to a stop, then the old record
 * slides out and the new one slides in".
 *
 * Deliberately prop-driven with no hub access, so the same stage powers both the
 * hub-connected deck and the standalone (no-preview) deck, where `spinState` is
 * always idle and the swap therefore slides at once. The movement is clipped at
 * the deck edge by the surrounding `overflow-hidden` deck surface.
 *
 * Rotor-angle continuity has two guards. (1) The displayed discs are driven from
 * state (`current`/`previous`), never the live props — the `record`/`swapKey` props
 * flip the instant a new album is clicked, one render before the swap state
 * catches up, so a prop-keyed disc would remount for that one frame and reset the
 * rotor. (2) Each disc is keyed by its own identity, not by role, so the SAME
 * {@link VinylRecord} instance carries across every role change (resting → outgoing
 * → unmount, and incoming → resting). Together they keep the spinning label from
 * ever snapping back to 0° when a swap starts.
 *
 * Interrupt contract: a swap arriving mid-flight cancels the predecessor's
 * timeline (no settle) and starts fresh; the settle unmounts the outgoing element
 * via a generation guard and re-arms the resting record. Reduced motion skips the
 * coast wait entirely and swaps instantly (the new record simply appears).
 *
 * @param props - {@link RecordSwapStageProps}.
 */
export function RecordSwapStage({
  record,
  sideLayout,
  spinState,
  swapKey,
  onSettled,
  children,
  className,
}: RecordSwapStageProps) {
  const [swap, setSwap] = useState<SwapState>({
    phase: SwapPhase.Idle,
    current: record,
    currentKey: swapKey,
    previous: null,
    previousSideLayout: undefined,
    previousKey: null,
    generation: 0,
  });
  const previousSwapKeyRef = useRef(swapKey);
  const currentSideLayoutRef = useRef(sideLayout);
  const incomingRef = useRef<HTMLDivElement>(null);
  const outgoingRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<RecordSwapHandle | null>(null);
  // Fires the latest onSettled without making it an effect dependency.
  const fireSettled = useEffectEvent(() => onSettled?.());

  // Retain the live side independently from React state. A later record swap
  // snapshots this value for the outgoing disc, rather than using the incoming
  // track's side while it coasts and slides away.
  useEffect(() => {
    if (previousSwapKeyRef.current === swapKey) currentSideLayoutRef.current = sideLayout;
  }, [sideLayout, swapKey]);

  // Detects a record-identity change and enters the swap, promoting the new record
  // into `current` while snapshotting the outgoing one into `previous`. Reduced
  // motion swaps instantly; otherwise the old record is held on the platter to
  // coast down (PendingCoast) until the spin settles. The `cancelled` guard +
  // cleanup keep this a genuine reaction to an external change (not derived state).
  useEffect(() => {
    if (previousSwapKeyRef.current === swapKey) return;
    let cancelled = false;
    const startSwap = () => {
      if (cancelled) return;
      const outgoingSideLayout = currentSideLayoutRef.current;
      previousSwapKeyRef.current = swapKey;
      currentSideLayoutRef.current = sideLayout;
      if (prefersReducedMotion()) {
        // Instant swap: the new record simply becomes the resting disc.
        setSwap((state) => ({
          phase: SwapPhase.Idle,
          current: record,
          currentKey: swapKey,
          previous: null,
          previousSideLayout: undefined,
          previousKey: null,
          generation: state.generation + 1,
        }));
        return;
      }
      setSwap((state) => ({
        phase: SwapPhase.PendingCoast,
        current: record,
        currentKey: swapKey,
        // Only a swap starting from rest snapshots a new outgoing disc; a swap that
        // interrupts an in-flight one keeps the already-visible outgoing (`previous`)
        // so the coasting disc never jumps and skipped middle records never flash.
        previous: state.previous ?? state.current,
        previousSideLayout: state.previous ? state.previousSideLayout : outgoingSideLayout,
        previousKey: state.previousKey ?? state.currentKey,
        generation: state.generation + 1,
      }));
    };
    startSwap();
    return () => {
      cancelled = true;
    };
  }, [record, sideLayout, swapKey]);

  // Coast gate: once the deck's spin has wound down to idle, promote a pending
  // swap into the sliding phase so the arc animation runs. A deck that was
  // already idle at swap time (paused, or the static standalone deck) slides at
  // once because this fires on the same commit.
  useEffect(() => {
    if (swap.phase !== SwapPhase.PendingCoast) return;
    if (spinState !== VinylSpinState.Idle) return;
    let cancelled = false;
    const beginSlide = () => {
      if (cancelled) return;
      setSwap((state) => (state.phase === SwapPhase.PendingCoast ? { ...state, phase: SwapPhase.Sliding } : state));
    };
    beginSlide();
    return () => {
      cancelled = true;
    };
  }, [swap.phase, spinState]);

  // Builds and runs the arc timeline for the sliding phase. `unmountOutgoing`
  // drops the outgoing buffer (generation-guarded). On natural completion the
  // timeline's `onSettle` unmounts AND fires the parent `onSettled` (async, so it
  // is a legitimate parent notification, not live state passed during the effect).
  // A `null` handle (no Web Animations API — jsdom/SSR) only unmounts, without the
  // parent notification, so the synchronous fallback never notifies the parent
  // from inside the effect.
  useEffect(() => {
    if (swap.phase !== SwapPhase.Sliding || swap.previous === null) return;
    const incoming = incomingRef.current;
    const outgoing = outgoingRef.current;
    if (!incoming || !outgoing) return;

    const settledGeneration = swap.generation;
    const unmountOutgoing = () => {
      setSwap((state) =>
        state.generation === settledGeneration
          ? { ...state, phase: SwapPhase.Idle, previous: null, previousKey: null, previousSideLayout: undefined }
          : state,
      );
    };

    handleRef.current?.cancel();
    handleRef.current = buildRecordSwapTimeline({
      incoming,
      outgoing,
      onSettle: () => {
        unmountOutgoing();
        fireSettled();
      },
    });
    if (handleRef.current === null) unmountOutgoing();

    return () => {
      handleRef.current?.cancel();
      handleRef.current = null;
    };
  }, [swap.phase, swap.generation, swap.previous]);

  const sliding = swap.phase === SwapPhase.Sliding;
  const visibleCurrentSideLayout = previousSwapKeyRef.current === swapKey ? sideLayout : currentSideLayoutRef.current;

  return (
    <div className={cn("relative h-full w-full", className)}>
      {/* The outgoing record: ONE element across PendingCoast (winding down on the
          platter with the live spin) and Sliding (idle spin, arced out by the
          timeline). Keyed by its own identity so the SAME instance carries over
          from the resting slot — that is what stops the rotor angle snapping when
          the swap starts. */}
      {swap.previous !== null && (
        <div
          key={swap.previousKey ?? "record-outgoing"}
          ref={outgoingRef}
          className={cn("absolute inset-0 z-10", sliding && "transform-gpu will-change-transform")}
        >
          <VinylRecord
            {...swap.previous}
            className="h-full w-full"
            sideLayout={swap.previousSideLayout}
            spinState={sliding ? VinylSpinState.Idle : spinState}
          />
        </div>
      )}

      {/* The current record: the resting disc (live spin) at rest, or the incoming
          disc (idle spin, arced in) during the slide. Withheld entirely while the
          outgoing record is still coasting. Driven from state (`current`), NOT the
          live prop, so the spinning disc survives the prop flip on a new click and
          is never re-keyed/remounted mid-spin. */}
      {swap.phase !== SwapPhase.PendingCoast && (
        <div
          key={swap.currentKey}
          ref={incomingRef}
          className={cn("absolute inset-0 z-10", sliding && "transform-gpu will-change-transform")}
        >
          <VinylRecord
            {...swap.current}
            className="h-full w-full"
            sideLayout={visibleCurrentSideLayout}
            spinState={sliding ? VinylSpinState.Idle : spinState}
          />
        </div>
      )}

      {/* The spindle centrepiece (children): above the record at rest / while
          coasting (it pokes through the centre hole), below the records during the
          slide (they have lifted off it). z-index only competes with the records
          inside this stage, so `z-0` vs `z-20` straddles the records' `z-10`. */}
      {children && <div className={cn("absolute inset-0", sliding ? "z-0" : "z-20")}>{children}</div>}
    </div>
  );
}
