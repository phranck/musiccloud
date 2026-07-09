import { useEffect, useRef, useState } from "react";
import { VinylRecord, type VinylRecordProps } from "@/components/vinyl/VinylRecord";
import { VinylSpinState, type VinylSpinState as VinylSpinStateValue } from "@/components/vinyl/VinylRecord.types";
import { buildRecordSwapTimeline, type RecordSwapHandle } from "@/lib/motion/recordSwap";
import { cn } from "@/lib/utils";

/** The vinyl-label fields of a record (no spin state, no class — the stage owns those). */
export type RecordLabel = Omit<VinylRecordProps, "spinState" | "className">;

/** Props for {@link RecordSwapStage}. */
interface RecordSwapStageProps {
  /** The current record's vinyl-label fields (cover art, title, catalog, ...). */
  record: RecordLabel;
  /** Spin state applied to the settled record (during a swap the incoming is idle). */
  spinState: VinylSpinStateValue;
  /**
   * Identity of the current record. A change triggers the arc swap: the previous
   * record slides out while the new one slides in. Same value = no swap.
   */
  swapKey: string;
  /** Extra classes on the stage wrapper (sizes/positions it over the platter). */
  className?: string;
}

/**
 * Swap animation state. The incoming record is NOT stored here (it is rendered
 * straight from the `record` prop); only the outgoing snapshot and the generation
 * live in state.
 */
interface SwapState {
  /** The outgoing disc's label fields during a swap, or `null` when at rest. */
  previous: RecordLabel | null;
  /** Bumped on every swap; keys the buffers and guards the settle. */
  generation: number;
}

/**
 * Renders the vinyl record on the platter and animates the arc swap when the
 * record identity ({@link RecordSwapStageProps.swapKey}) changes: a double buffer
 * of {@link VinylRecord}s (outgoing snapshot + incoming current) driven by
 * {@link buildRecordSwapTimeline} (Web Animations API). Deliberately prop-driven
 * with no hub access, so it works both inside the platter and as a layer above the
 * audio hub (the placement MC-113 chooses). The movement is clipped at the deck
 * edge by the surrounding `overflow-hidden` deck surface.
 *
 * The incoming record is rendered straight from the `record` prop (never copied
 * into state); only the outgoing snapshot is captured for the duration of the
 * swap, mirroring the cover-swap double buffer in `SongInfo`. Interrupt contract:
 * a swap arriving mid-flight cancels the predecessor's timeline (no settle) and
 * starts fresh; the settle unmounts the outgoing buffer via a generation guard.
 * Reduced motion (factory returns `null`) settles immediately.
 *
 * @param props - {@link RecordSwapStageProps}.
 */
export function RecordSwapStage({ record, spinState, swapKey, className }: RecordSwapStageProps) {
  const [swap, setSwap] = useState<SwapState>({ previous: null, generation: 0 });
  const previousSwapKeyRef = useRef(swapKey);
  // The label fields currently shown, snapshotted as the outgoing disc when a swap starts.
  const displayedRecordRef = useRef(record);
  const incomingRef = useRef<HTMLDivElement>(null);
  const outgoingRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<RecordSwapHandle | null>(null);

  useEffect(() => {
    if (previousSwapKeyRef.current === swapKey) return;
    let cancelled = false;
    const startSwap = () => {
      if (cancelled) return;
      const outgoing = displayedRecordRef.current;
      previousSwapKeyRef.current = swapKey;
      displayedRecordRef.current = record;
      setSwap((state) => ({ previous: outgoing, generation: state.generation + 1 }));
    };
    startSwap();
    return () => {
      cancelled = true;
    };
  }, [swapKey, record]);

  useEffect(() => {
    if (swap.previous === null) return;
    const incoming = incomingRef.current;
    const outgoing = outgoingRef.current;
    if (!incoming || !outgoing) return;

    const settledGeneration = swap.generation;
    const settle = () =>
      setSwap((state) => (state.generation === settledGeneration ? { ...state, previous: null } : state));

    handleRef.current?.cancel();
    handleRef.current = buildRecordSwapTimeline({ incoming, outgoing, onSettle: settle });
    // Reduced motion / no Web Animations API: the commit already shows the incoming
    // record in place, so settle (unmount the outgoing buffer) immediately.
    if (handleRef.current === null) settle();

    return () => {
      handleRef.current?.cancel();
      handleRef.current = null;
    };
  }, [swap.generation, swap.previous]);

  const swapping = swap.previous !== null;

  return (
    <div className={cn("relative h-full w-full", className)}>
      {swap.previous !== null && (
        <div
          key={`record-out-${swap.generation}`}
          ref={outgoingRef}
          className="absolute inset-0 transform-gpu will-change-transform"
        >
          <VinylRecord {...swap.previous} className="h-full w-full" spinState={VinylSpinState.Coasting} />
        </div>
      )}
      <div
        key={`record-in-${swap.generation}`}
        ref={incomingRef}
        className={cn("h-full w-full", swapping && "absolute inset-0 transform-gpu will-change-transform")}
      >
        <VinylRecord {...record} className="h-full w-full" spinState={swapping ? VinylSpinState.Idle : spinState} />
      </div>
    </div>
  );
}
