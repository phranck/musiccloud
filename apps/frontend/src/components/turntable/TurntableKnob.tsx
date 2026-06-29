import { type CSSProperties, type KeyboardEvent, type PointerEvent, useState } from "react";
import {
  TurntableSpeed,
  type TurntableSpeed as TurntableSpeedValue,
  useTurntablePlayer,
} from "@/components/turntable/TurntablePlayerContext";
import { speedFromAngle, speedKnobAngle, stepSpeed } from "@/components/turntable/turntableState";
import { cn } from "@/lib/utils";

/**
 * Radial-gradient dial face of the speed knob, ported verbatim from the former
 * decorative knob so the optic stays pixel-identical to the accepted mockup.
 */
const SPEED_KNOB_STYLE = {
  background:
    "radial-gradient(circle at 48% 48%, #252b35 0 56%, #0b0e13 57.5% 59%, #333944 60% 61.2%, #090b0f 62% 100%)",
  boxShadow:
    "0 0 0 1px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.13), 0 3px 4px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.07), inset 0 -3px 5px rgba(0,0,0,0.32)",
} satisfies CSSProperties;

/** Indicator line styling (colour + the `0% 50%` origin the rotation pivots on). */
const SPEED_MARK_BASE_STYLE = {
  background: "rgba(222,228,236,0.48)",
  transformOrigin: "0% 50%",
} satisfies CSSProperties;

/**
 * Builds the speed-knob indicator transform for a given angle.
 *
 * `translateY(-50%)` keeps the line vertically centred on the knob; `rotate`
 * aims it. When `gpuLayer` is set, a trailing `translateZ(0)` forces a stable
 * compositor layer so the interactive knob's snap/drag stays on the GPU
 * ([[feedback_animations_always_gpu]]); the static decorative knob omits it so
 * its transform stays byte-identical to the accepted deck optic. The transform
 * never reads the layout (transform-only).
 *
 * @param angleDeg - Indicator angle in degrees (CSS convention: 0 points right,
 *   positive is clockwise).
 * @param gpuLayer - When true, append `translateZ(0)` for a GPU compositor layer.
 * @returns The CSS `transform` value for the indicator line.
 */
function knobIndicatorTransform(angleDeg: number, gpuLayer = false): string {
  const base = `translateY(-50%) rotate(${angleDeg}deg)`;
  return gpuLayer ? `${base} translateZ(0)` : base;
}

/** Props for {@link KnobDial}. */
interface KnobDialProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Indicator line angle in degrees ({@link knobIndicatorTransform}). */
  indicatorAngleDeg: number;
  /**
   * When true, the dial is interactive: the indicator gets a GPU compositor
   * layer (`translateZ(0)`) and eases to its angle with a short transition as it
   * snaps between detents. The decorative dial leaves it false, so its transform
   * stays plain (byte-identical to the accepted optic).
   */
  interactive?: boolean;
  /**
   * Whether the indicator eases to its angle via a short transition. Only
   * meaningful when {@link interactive}; the interactive knob keeps it on so the
   * line glides as it snaps from one detent to the next.
   */
  animateIndicator?: boolean;
}

/**
 * Presentational knob dial: the round gradient face plus the indicator line.
 *
 * Shared by the decorative knob (`TurntablePlayerKnob`, `aria-hidden`) and the
 * interactive {@link TurntableKnob} (which spreads `role="slider"`, handlers and
 * focus props through `...rest`). Carries the `data-turntable-speed-knob` /
 * `-speed-indicator` hooks the deck selectors and tests rely on.
 *
 * @param props - {@link KnobDialProps} plus any span attributes to spread onto
 *   the dial (role, tabIndex, aria-*, pointer/keyboard handlers).
 */
export function KnobDial({
  indicatorAngleDeg,
  interactive = false,
  animateIndicator = false,
  className,
  ...rest
}: KnobDialProps) {
  return (
    <span
      className={cn("absolute right-0 bottom-0 aspect-square w-[73%] rounded-full", className)}
      data-turntable-speed-knob="true"
      style={SPEED_KNOB_STYLE}
      {...rest}
    >
      <span
        className="absolute left-1/2 top-1/2 h-0.5 w-[38%] rounded-full"
        data-turntable-speed-indicator="true"
        style={{
          ...SPEED_MARK_BASE_STYLE,
          transform: knobIndicatorTransform(indicatorAngleDeg, interactive),
          // Animate only on release/keyboard, never while the pointer drags.
          transition: animateIndicator ? "transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1)" : "none",
        }}
      />
    </span>
  );
}

/** Pixels the pointer must travel before a press counts as a drag (else it is a no-op tap). */
const KNOB_DRAG_THRESHOLD_PX = 3;

/** Accessible value text spoken for each speed by `aria-valuetext`. */
const SPEED_VALUE_TEXT: Record<TurntableSpeedValue, string> = {
  [TurntableSpeed.Standby]: "Standby",
  [TurntableSpeed.Rpm33]: "33 RPM",
  [TurntableSpeed.Rpm45]: "45 RPM",
};

/** Numeric ladder position for `aria-valuenow` (0 = Standby, 1 = 33, 2 = 45). */
const SPEED_VALUE_NOW: Record<TurntableSpeedValue, number> = {
  [TurntableSpeed.Standby]: 0,
  [TurntableSpeed.Rpm33]: 1,
  [TurntableSpeed.Rpm45]: 2,
};

/** Live drag tracking: the down point (for the threshold) and the snapped stage. */
interface KnobDragState {
  /** Pointer client X at press, used to measure drag distance. */
  startX: number;
  /** Pointer client Y at press, used to measure drag distance. */
  startY: number;
  /**
   * The speed stage the live pointer angle snaps to. The knob rests on a stage
   * (STANDBY/33/45) at all times and never points between captions, so the
   * dragged value is a detent, not a free angle.
   */
  snappedSpeed: TurntableSpeedValue;
  /** True once the pointer has moved past {@link KNOB_DRAG_THRESHOLD_PX}. */
  moved: boolean;
}

/**
 * Angle in CSS degrees from a knob's centre to a pointer position.
 *
 * `atan2(dy, dx)` already matches the CSS rotate convention (0 points right,
 * positive clockwise because the document y-axis points down), so the result
 * lines up directly with {@link speedKnobAngle} / {@link speedFromAngle}.
 *
 * @param rect - The knob's bounding box.
 * @param clientX - Pointer client X.
 * @param clientY - Pointer client Y.
 * @returns The pointer angle in degrees.
 */
function pointerAngleDeg(rect: DOMRect, clientX: number, clientY: number): number {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return (Math.atan2(clientY - centerY, clientX - centerX) * 180) / Math.PI;
}

/**
 * The interactive turntable speed knob: a draggable rotary `role="slider"` that
 * selects Standby / 33 / 45 on the {@link useTurntablePlayer} hub.
 *
 * Interaction (MC-071 design decision A — drag, not click-to-cycle):
 * - **Drag** (pointer down → move → up): the live pointer angle snaps to the
 *   nearest of the three stages (STANDBY/33/45) via {@link speedFromAngle}, so the
 *   indicator rests on a detent and never points between captions while dragging;
 *   on release {@link useTurntablePlayer.setSpeed} applies that stage. A press with
 *   no real movement (below {@link KNOB_DRAG_THRESHOLD_PX}) is a no-op — pure drag
 *   semantics, no click-stepping.
 * - **Keyboard**: Up/Right step toward a faster speed, Down/Left toward Standby
 *   (clamped via {@link stepSpeed}); Home selects Standby, End selects 45. The
 *   handled keys stop propagation so the page-global spacebar/arrow audio router
 *   does not also fire (no double seek, no stray play-toggle). Space/Enter are
 *   consumed as no-ops for the same reason.
 *
 * **WebAudio gesture timing:** `setSpeed` is invoked synchronously inside the
 * pointer/keyboard handler so the user-activation that `AudioContext.resume()`
 * needs survives — there is no `await` before it (a deferred call would leave the
 * spectrum dark, see the timing contract on `ensureSpectrumAnalyzer`).
 *
 * Must render inside a `TurntablePlayerProvider`.
 */
export function TurntableKnob() {
  const { speed, setSpeed } = useTurntablePlayer();
  const [drag, setDrag] = useState<KnobDragState | null>(null);

  const handlePointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ startX: event.clientX, startY: event.clientY, snappedSpeed: speed, moved: false });
  };

  const handlePointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // Snap the live pointer angle to the nearest stage so the knob steps between
    // STANDBY/33/45 and never drifts to a free angle between the captions.
    const snappedSpeed = speedFromAngle(pointerAngleDeg(rect, event.clientX, event.clientY));
    const moved =
      drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > KNOB_DRAG_THRESHOLD_PX;
    setDrag({ ...drag, snappedSpeed, moved });
  };

  const handlePointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // Only a real drag changes the speed; a tap with no movement is a no-op.
    // setSpeed runs synchronously here so the gesture activation survives for
    // AudioContext.resume() (no await before it).
    if (drag?.moved) setSpeed(drag.snappedSpeed);
    setDrag(null);
  };

  const handlePointerCancel = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    // Map the navigation keys to a speed change, or consume Space/Enter so the
    // page-global audio keyboard router never fires while the knob is focused.
    let next: TurntableSpeedValue | null = null;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = stepSpeed(speed, 1);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = stepSpeed(speed, -1);
        break;
      case "Home":
        next = TurntableSpeed.Standby;
        break;
      case "End":
        next = TurntableSpeed.Rpm45;
        break;
      case " ":
      case "Enter":
        // Consumed no-op: the knob is drag/arrow-driven, and swallowing these
        // keeps the global spacebar play-toggle from firing on a focused knob.
        event.preventDefault();
        event.stopPropagation();
        return;
      default:
        return;
    }
    event.preventDefault();
    // Stop the global arrow/space audio router (window keydown) from also acting.
    event.stopPropagation();
    if (next !== speed) setSpeed(next);
  };

  const indicatorAngleDeg = speedKnobAngle(drag ? drag.snappedSpeed : speed);

  return (
    <KnobDial
      aria-label="Turntable speed"
      aria-valuemax={SPEED_VALUE_NOW[TurntableSpeed.Rpm45]}
      aria-valuemin={SPEED_VALUE_NOW[TurntableSpeed.Standby]}
      aria-valuenow={SPEED_VALUE_NOW[speed]}
      aria-valuetext={SPEED_VALUE_TEXT[speed]}
      // Ease the indicator to every stage so it glides as it snaps between
      // detents while dragging and on a release/keyboard change.
      animateIndicator
      className="cursor-grab touch-none active:cursor-grabbing"
      indicatorAngleDeg={indicatorAngleDeg}
      interactive
      onKeyDown={handleKeyDown}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="slider"
      tabIndex={0}
    />
  );
}
