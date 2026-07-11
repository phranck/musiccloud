import type { VinylLayout } from "@musiccloud/shared";
import type { RecordLabel } from "@/components/turntable/RecordSwapStage";
import { TurntableSpeed } from "@/components/turntable/TurntablePlayerContext";
import {
  TurntablePlayerControl,
  TurntablePlayerKnob,
  TurntablePlayerLayoutLed,
  TurntablePlayerLed,
  TurntablePlayerPlatter,
  TurntablePlayerSurface,
} from "@/components/turntable/TurntablePlayerParts";
import { derivePower } from "@/components/turntable/turntableState";
import { VinylSpinState } from "@/components/vinyl/VinylRecord.types";
import type { VinylRecordProps } from "./VinylRecord";

/** Record data for the standalone, non-preview turntable. */
type TurntableRecord = RecordLabel &
  Pick<VinylRecordProps, "className" | "spinState" | "sideLayout"> & {
    /** Persisted Discogs layout used by the orange indicator lamp. */
    vinylLayout?: VinylLayout | null;
  };

export interface TurntableProps {
  className?: string;
  record: TurntableRecord;
  /** Identity of the current record; a change runs the arc swap. */
  swapKey: string;
}

/**
 * Standalone turntable deck driven entirely by its `record` prop.
 *
 * This is the prop-driven counterpart to the hub-connected `TurntablePlayer`
 * compound: it arranges the same presentational parts (frame, platter, speed
 * control, LED) but takes the spin state from `record.spinState` instead of the
 * turntable hub, so it renders without a `TurntablePlayerProvider`. The optic is
 * identical to the accepted mockup; every `data-turntable-*` attribute is
 * preserved by the underlying parts.
 *
 * The speed control rests at {@link TurntableSpeed.Rpm33} (the deck's default
 * indicator position) unless the record carries an explicit `speed`, matching
 * the former always-33⅓ deck print.
 *
 * @param props - {@link TurntableProps}.
 */
export function Turntable({ className, record, swapKey }: TurntableProps) {
  const {
    className: recordClassName,
    defaultSideLayout,
    sideLayout,
    spinState = VinylSpinState.Idle,
    vinylLayout,
    ...labelProps
  } = record;
  // The standalone deck has no playback to derive a state from, so it renders the
  // accepted static deck print: the knob points at "33" and the LED is lit. The
  // live play state only drives the hub-connected TurntablePlayer.
  const speed = TurntableSpeed.Rpm33;

  return (
    <TurntablePlayerSurface className={className}>
      <TurntablePlayerPlatter
        record={{
          ...labelProps,
          className: recordClassName,
          sideLayout: sideLayout ?? defaultSideLayout,
        }}
        spinState={spinState}
        swapKey={swapKey}
      />
      <TurntablePlayerControl speed={speed}>
        <TurntablePlayerKnob speed={speed} />
      </TurntablePlayerControl>
      <TurntablePlayerLayoutLed vinylLayout={vinylLayout} />
      <TurntablePlayerLed power={derivePower(speed)} />
    </TurntablePlayerSurface>
  );
}
