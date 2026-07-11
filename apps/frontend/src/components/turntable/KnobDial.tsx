import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Radial-gradient dial face of the speed knob, ported verbatim from the original
 * deck so the optic stays pixel-identical to the accepted mockup.
 */
const SPEED_KNOB_STYLE = {
  background:
    "repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.026) 0 0.45px, rgba(0,0,0,0.08) 0.45px 0.9px, transparent 0.9px 2.6px), radial-gradient(circle at 50% 50%, #252b35 0 56%, #0b0e13 57.5% 59%, #333944 60% 61.2%, #090b0f 62% 100%)",
  boxShadow:
    "0 0 0 1px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.13), 0 3px 4px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.07), inset 0 -3px 5px rgba(0,0,0,0.32)",
} satisfies CSSProperties;

/** Indicator line styling (colour + the `0% 50%` origin the rotation pivots on). */
const SPEED_MARK_BASE_STYLE = {
  background: "rgba(222,228,236,0.48)",
  transformOrigin: "0% 50%",
} satisfies CSSProperties;

/** Subtle directional sheen on the brushed-metal knob face. */
const BRUSHED_METAL_REFLECTION_STYLE = {
  background:
    "conic-gradient(from 292deg at 50% 50%, transparent 0deg 8deg, rgba(255,255,255,0.03) 15deg, rgba(255,255,255,0.15) 30deg, rgba(255,255,255,0.08) 45deg, rgba(255,255,255,0.025) 63deg, transparent 82deg 184deg, rgba(255,255,255,0.02) 194deg, rgba(255,255,255,0.1) 214deg, rgba(255,255,255,0.055) 232deg, rgba(255,255,255,0.018) 252deg, transparent 274deg 360deg)",
  filter: "blur(1px)",
  transform: "none",
  transition: "none",
} satisfies CSSProperties;

const KNOB_ROTATION_TRANSITION = "transform 480ms cubic-bezier(0.22, 0.61, 0.36, 1)";

/**
 * Builds the speed-knob indicator transform for a given angle.
 *
 * `translateY(-50%)` keeps the line vertically centred on the knob; `rotate` aims
 * it. When `gpuLayer` is set, a trailing `translateZ(0)` forces a stable
 * compositor layer so the indicator's glide between STANDBY and 33 stays on the
 * GPU ([[feedback_animations_always_gpu]]); the static decorative knob omits it so
 * its transform stays byte-identical to the accepted deck optic. The transform
 * never reads layout (transform-only).
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
   * When true, the indicator gets a GPU compositor layer (`translateZ(0)`) so it
   * composites cheaply while it eases between angles. The static decorative dial
   * leaves it false, keeping its transform byte-identical to the accepted optic.
   */
  gpuLayer?: boolean;
  /**
   * Whether the indicator eases to its angle via a short transition. The
   * hub-driven indicator turns this on so the line glides from STANDBY to 33 (and
   * back) as playback starts and stops; the static deck leaves it off.
   */
  animated?: boolean;
}

/**
 * Presentational speed-knob dial: the round gradient face plus the indicator line.
 *
 * The knob is a pure **indicator**, never a control — it has no input handling.
 * Two callers render it: the hub-driven deck (animated, the indicator points at
 * the live play state and glides between STANDBY and 33) and the standalone
 * decorative deck (static). It carries the `data-turntable-speed-knob` /
 * `-speed-indicator` hooks the deck selectors and tests rely on, and stays out of
 * the accessibility tree via the spread `aria-hidden`.
 *
 * @param props - {@link KnobDialProps} plus any span attributes to spread onto the
 *   dial (e.g. `aria-hidden`).
 */
export function KnobDial({ indicatorAngleDeg, gpuLayer = false, animated = false, className, ...rest }: KnobDialProps) {
  return (
    <span
      className={cn("absolute right-0 bottom-0 aspect-square w-[73%] rounded-full", className)}
      data-turntable-speed-knob="true"
      style={SPEED_KNOB_STYLE}
      {...rest}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[9%] rounded-full"
        data-turntable-knob-reflection="true"
        style={BRUSHED_METAL_REFLECTION_STYLE}
      />
      <span
        className="absolute left-1/2 top-1/2 h-0.5 w-[38%] rounded-full"
        data-turntable-speed-indicator="true"
        style={{
          ...SPEED_MARK_BASE_STYLE,
          transform: knobIndicatorTransform(indicatorAngleDeg, gpuLayer),
          // Animate only when the hub asks for it (play/pause glide); the static
          // deck keeps the indicator fixed.
          transition: animated ? KNOB_ROTATION_TRANSITION : "none",
        }}
      />
    </span>
  );
}
