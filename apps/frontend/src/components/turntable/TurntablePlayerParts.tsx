import type { CSSProperties } from "react";
import {
  type TurntablePower as TurntablePowerValue,
  type TurntableSpeed as TurntableSpeedValue,
  useTurntablePlayer,
} from "@/components/turntable/TurntablePlayerContext";
import { speedKnobAngle } from "@/components/turntable/turntableState";
import { VinylRecord, type VinylRecordProps } from "@/components/vinyl/VinylRecord";
import type { VinylSpinState as VinylSpinStateValue } from "@/components/vinyl/VinylRecord.types";
import { cn } from "@/lib/utils";

// Deck-chrome styles, ported verbatim from the former monolithic `Turntable`
// component so the rendered optic stays pixel-identical to the accepted mockup.
// The compound parts below carry these styles directly; `Turntable.tsx` arranges
// the parts without restyling them.

const PLATTER_STYLE = {
  background: "linear-gradient(180deg, #20262e 0%, #161b22 100%)",
  boxShadow:
    "0 0 0 2px rgba(5,7,10,0.92), 0 0 0 4px rgba(71,78,90,0.52), 0 1px 0 rgba(255,255,255,0.12), inset 0 1px 1px rgba(255,255,255,0.08), inset 0 -2px 3px rgba(0,0,0,0.38)",
} satisfies CSSProperties;

const SPEED_KNOB_STYLE = {
  background:
    "radial-gradient(circle at 48% 48%, #252b35 0 56%, #0b0e13 57.5% 59%, #333944 60% 61.2%, #090b0f 62% 100%)",
  boxShadow:
    "0 0 0 1px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.13), 0 3px 4px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.07), inset 0 -3px 5px rgba(0,0,0,0.32)",
} satisfies CSSProperties;

const SPEED_MARK_BASE_STYLE = {
  background: "rgba(222,228,236,0.48)",
  transformOrigin: "0% 50%",
} satisfies CSSProperties;

const LED_STYLE = {
  background: "radial-gradient(circle at 35% 30%, #f0ffd8 0 11%, #8dff8c 18%, #2fc956 52%, #0b4f26 100%)",
  boxShadow:
    "0 0 0 1px rgba(0,0,0,0.7), 0 0 4px rgba(104,255,122,0.24), 0 0 12px rgba(48,210,83,0.11), 0 0 22px rgba(48,210,83,0.06), inset 0 1px 1px rgba(255,255,255,0.58), inset 0 -1px 2px rgba(0,0,0,0.48)",
} satisfies CSSProperties;

const LED_GLOW_STYLE = {
  background:
    "radial-gradient(circle, rgba(118,255,133,0.34) 0 12%, rgba(54,218,83,0.19) 26%, rgba(45,186,75,0.09) 43%, transparent 66%)",
  filter: "blur(2px)",
} satisfies CSSProperties;

const SPINDLE_STYLE = {
  background:
    "radial-gradient(circle at 34% 28%, #ffffff 0 9%, #dfe5ea 14% 25%, #8f979e 43%, #343a40 68%, #eef2f5 100%)",
  boxShadow:
    "0 0 0 1px rgba(0,0,0,0.76), 0 1px 2px rgba(0,0,0,0.48), inset 0 1px 1px rgba(255,255,255,0.72), inset 0 -1px 1px rgba(0,0,0,0.58)",
} satisfies CSSProperties;

// Soft contact shadow the raised spindle drops onto the record, offset toward
// the lower-right so it falls away from the same light source the rainbow sheen
// reflects (sheen highlights sit upper-left / lower-right). translate carries the
// centering (-50%) plus that offset.
const SPINDLE_SHADOW_STYLE = {
  background: "radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0.5) 0 26%, rgba(0, 0, 0, 0.26) 52%, transparent 72%)",
  filter: "blur(1.4px)",
  transform: "translate(-38%, -30%)",
} satisfies CSSProperties;

/**
 * Builds the speed-knob indicator transform for a given knob angle.
 *
 * The indicator line is centered on the knob and rotated to point at the active
 * speed's caption ({@link speedKnobAngle}). `translateY(-50%)` keeps it vertically
 * centered; `rotate(<angle>deg)` aims it. `Rpm33` reproduces the original static
 * `rotate(-150deg)` decorative indicator exactly.
 *
 * @param angleDeg - Indicator angle in degrees from {@link speedKnobAngle}.
 * @returns The CSS `transform` value for the indicator line.
 */
function knobIndicatorTransform(angleDeg: number): string {
  return `translateY(-50%) rotate(${angleDeg}deg)`;
}

/** Props for {@link TurntablePlayerLed}. */
interface TurntablePlayerLedProps {
  /**
   * Current power state, surfaced on `data-turntable-led-power` so the hub
   * coupling is observable. The lit optic is identical in both states this unit
   * (a dimmed Standby variant is deferred), preserving the accepted deck look.
   */
  power: TurntablePowerValue;
}

/**
 * The deck power LED: a small round lamp pinned to the bottom-right of the deck.
 *
 * Renders the green gradient plus the soft outer glow, exactly the optic the
 * former decorative LED carried, and exposes the live `power` on
 * `data-turntable-led-power` for the hub coupling. The visible appearance does
 * not change between `On` and `Standby` in this unit — keeping the deck optic
 * 100% identical to the accepted mockup — while a later unit can introduce a
 * dimmed Standby state from the same `power` input. Decorative, so it stays
 * `aria-hidden`; selected in tests via `data-turntable-led`.
 *
 * @param props - {@link TurntablePlayerLedProps}.
 */
export function TurntablePlayerLed({ power }: TurntablePlayerLedProps) {
  return (
    <span
      aria-hidden="true"
      className="absolute right-[6.2%] bottom-[6%] z-40 aspect-square w-[calc(2.1%_-_1px)] overflow-visible rounded-full"
      data-turntable-led="true"
      data-turntable-led-power={power}
      style={LED_STYLE}
    >
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -z-10 aspect-square w-[430%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={LED_GLOW_STYLE}
      />
    </span>
  );
}

/** Props for {@link TurntablePlayerPlatter}. */
interface TurntablePlayerPlatterProps {
  /** Visual spin state forwarded to the {@link VinylRecord}. */
  spinState: VinylSpinStateValue;
  /** Rotor tempo forwarded to the {@link VinylRecord}. */
  speed: TurntableSpeedValue;
  /** The vinyl label/record props (artwork, title, catalog, ...). */
  record: Omit<VinylRecordProps, "spinState" | "speed">;
}

/**
 * The rotating-disc assembly: the recessed platter shadow, the {@link VinylRecord}
 * itself (fed `speed`/`spinState`), the spindle contact shadow and the chrome
 * spindle on top.
 *
 * The platter disc, spindle and its shadow are decorative deck chrome; the record
 * carries its own accessible name. All four layers keep their original
 * `data-turntable-*` attributes so existing selectors and tests still match.
 *
 * @param props - {@link TurntablePlayerPlatterProps}.
 */
export function TurntablePlayerPlatter({ spinState, speed, record }: TurntablePlayerPlatterProps) {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 z-10 aspect-square w-[calc(86%_-_4px)] -translate-x-1/2 -translate-y-1/2 rounded-full"
        data-turntable-platter="true"
        style={PLATTER_STYLE}
      />

      <span className="absolute left-1/2 top-1/2 z-20 aspect-square w-[86%] -translate-x-1/2 -translate-y-1/2">
        <VinylRecord
          {...record}
          className={cn("h-full w-full", record.className)}
          spinState={spinState}
          speed={speed}
        />
      </span>

      {/* Contact shadow the raised spindle casts onto the record. Sits below the
          spindle (z-50) but above the disc so it reads as resting on the vinyl. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 z-40 aspect-square w-[2.7%] rounded-full"
        data-turntable-spindle-shadow="true"
        style={SPINDLE_SHADOW_STYLE}
      />

      {/* Decorative chrome spindle — part of the turntable image, hidden from AT. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 z-50 aspect-square w-[2.15%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        data-turntable-spindle="true"
        style={SPINDLE_STYLE}
      />
    </>
  );
}

/**
 * Static speed captions printed beside the knob: "33", "45", "ON", "STANDBY".
 *
 * The captions are fixed deck print (not interactive), positioned at the same
 * box-relative coordinates as the accepted mockup. Rendered inside
 * {@link TurntablePlayerControl}, which owns the positioned label box.
 */
export function TurntablePlayerKnobLabels() {
  return (
    <>
      <span className="absolute left-[16.7%] top-[36.5%] -translate-y-full whitespace-nowrap">33</span>
      <span className="absolute left-[39.5%] top-[21.9%] -translate-y-full whitespace-nowrap">45</span>
      <span className="absolute left-[15.5%] top-[63.5%] -translate-x-full -translate-y-1/2 whitespace-nowrap">ON</span>
      <span className="absolute left-[21.9%] top-[87.5%] -translate-x-full whitespace-nowrap">STANDBY</span>
    </>
  );
}

/** Props for {@link TurntablePlayerKnob}. */
interface TurntablePlayerKnobProps {
  /** Current speed; positions the indicator line via {@link speedKnobAngle}. */
  speed: TurntableSpeedValue;
}

/**
 * The speed knob: a round dial with an indicator line that points at the active
 * speed's caption.
 *
 * In this unit the knob is purely indicative — it renders the dial chrome and
 * rotates the indicator to `speedKnobAngle(speed)` but takes no input (drag
 * interaction lands in a later unit). The indicator transform is GPU-friendly
 * (`translate` + `rotate` only). Decorative, so `aria-hidden`; selected in tests
 * via `data-turntable-speed-knob` / `data-turntable-speed-indicator`.
 *
 * @param props - {@link TurntablePlayerKnobProps}.
 */
export function TurntablePlayerKnob({ speed }: TurntablePlayerKnobProps) {
  return (
    <span
      aria-hidden="true"
      className="absolute right-0 bottom-0 aspect-square w-[73%] rounded-full"
      data-turntable-speed-knob="true"
      style={SPEED_KNOB_STYLE}
    >
      <span
        className="absolute left-1/2 top-1/2 h-0.5 w-[38%] rounded-full"
        data-turntable-speed-indicator="true"
        style={{ ...SPEED_MARK_BASE_STYLE, transform: knobIndicatorTransform(speedKnobAngle(speed)) }}
      />
    </span>
  );
}

/** Props for {@link TurntablePlayerControl}. */
interface TurntablePlayerControlProps {
  /** Current speed, forwarded to the {@link TurntablePlayerKnob} indicator. */
  speed: TurntableSpeedValue;
}

/**
 * The speed-control cluster: the positioned label box holding the static
 * {@link TurntablePlayerKnobLabels} captions and the {@link TurntablePlayerKnob}.
 *
 * This is the layout container the former `Turntable` rendered as a single
 * bottom-left `<span>`; the captions and knob keep their exact coordinates so the
 * optic is unchanged.
 *
 * @param props - {@link TurntablePlayerControlProps}.
 */
export function TurntablePlayerControl({ speed }: TurntablePlayerControlProps) {
  return (
    <span className="absolute bottom-[3.1%] left-[3.1%] z-30 aspect-square w-[19%] font-condensed text-[clamp(0.32rem,1.24vw,0.45rem)] font-bold leading-none tracking-[0.03em] text-white/70">
      <TurntablePlayerKnobLabels />
      <TurntablePlayerKnob speed={speed} />
    </span>
  );
}

/** Props for {@link HubLed}, {@link HubPlatter} and {@link HubControl}: the platter needs the record. */
interface HubPlatterProps {
  /** The vinyl label/record props; `speed`/`spinState` come from the hub. */
  record: Omit<VinylRecordProps, "spinState" | "speed">;
}

/**
 * Hub-connected {@link TurntablePlayerLed}: reads `power` from the turntable hub.
 *
 * Must render inside a `TurntablePlayerProvider`; the standalone `Turntable`
 * deck uses {@link TurntablePlayerLed} with an explicit `power` prop instead.
 */
export function HubLed() {
  const { power } = useTurntablePlayer();
  return <TurntablePlayerLed power={power} />;
}

/**
 * Hub-connected {@link TurntablePlayerPlatter}: reads `speed`/`spinState` from the
 * turntable hub and feeds them to the {@link VinylRecord}.
 *
 * Must render inside a `TurntablePlayerProvider`.
 *
 * @param props - {@link HubPlatterProps}.
 */
export function HubPlatter({ record }: HubPlatterProps) {
  const { speed, spinState } = useTurntablePlayer();
  return <TurntablePlayerPlatter record={record} speed={speed} spinState={spinState} />;
}

/**
 * Hub-connected {@link TurntablePlayerControl}: reads `speed` from the turntable
 * hub to position the knob indicator.
 *
 * Must render inside a `TurntablePlayerProvider`.
 */
export function HubControl() {
  const { speed } = useTurntablePlayer();
  return <TurntablePlayerControl speed={speed} />;
}

/** Props for {@link TurntablePlayerRoot}. */
interface TurntablePlayerRootProps {
  /** Extra classes merged onto the deck figure. */
  className?: string;
  /** The vinyl label/record props; the platter pulls `speed`/`spinState` from the hub. */
  record: Omit<VinylRecordProps, "spinState" | "speed">;
}

/**
 * Default hub-driven turntable deck: the framed surface plus the LED, platter and
 * speed control wired to the {@link useTurntablePlayer} hub.
 *
 * This renders the same deck the standalone `Turntable` component does, but reads
 * its live spin/speed/power from the hub instead of props. It is the default
 * layout of the `TurntablePlayer` compound; callers that need finer control
 * compose {@link HubLed}/{@link HubPlatter}/{@link HubControl} themselves. Must
 * render inside a `TurntablePlayerProvider`.
 *
 * @param props - {@link TurntablePlayerRootProps}.
 */
export function TurntablePlayerRoot({ className, record }: TurntablePlayerRootProps) {
  return (
    <TurntablePlayerSurface className={className}>
      <HubPlatter record={record} />
      <HubControl />
      <HubLed />
    </TurntablePlayerSurface>
  );
}

/** Props for {@link TurntablePlayerSurface}. */
interface TurntablePlayerSurfaceProps {
  /** Extra classes merged onto the deck figure. */
  className?: string;
  /** Deck contents (platter, control, LED, brand). */
  children: React.ReactNode;
}

const TURNTABLE_SURFACE_STYLE = {
  background: "linear-gradient(180deg, #262b34 0%, #181d24 56%, #0f1319 100%)",
} satisfies CSSProperties;

/**
 * The framed deck surface: the labelled square figure with the brushed-metal
 * gradient and the decorative brand print, holding the turntable parts.
 *
 * Shared by {@link TurntablePlayerRoot} (hub-driven) and the standalone
 * `Turntable` deck so the frame, branding and aspect ratio live in exactly one
 * place. The figure carries the single accessible name ("Turntable"); everything
 * inside is decorative.
 *
 * @param props - {@link TurntablePlayerSurfaceProps}.
 */
export function TurntablePlayerSurface({ className, children }: TurntablePlayerSurfaceProps) {
  return (
    <figure
      aria-label="Turntable"
      className={cn("relative aspect-square overflow-hidden rounded-[inherit] bg-[#171a1f]", className)}
      style={TURNTABLE_SURFACE_STYLE}
    >
      <TurntablePlayerBrand />
      {children}
    </figure>
  );
}

/**
 * Decorative deck branding ("music cloud") printed in the top-left corner.
 *
 * `aria-hidden` because the whole turntable is already named by the figure's
 * `aria-label`; a per-letter screen-reader readout would only add noise. Selected
 * in tests via `data-turntable-brand`.
 */
function TurntablePlayerBrand() {
  return (
    <span
      aria-hidden="true"
      className="absolute left-[5.2%] top-[5.2%] z-40 grid w-[10.2%] gap-[0.18em] text-[clamp(0.48rem,1.72vw,0.62rem)] leading-none text-white/85"
      data-turntable-brand="true"
      style={{ fontFamily: '"Michroma", var(--font-sans)' }}
    >
      <span className="flex w-full justify-between" aria-hidden="true">
        {brandLetters("music")}
      </span>
      <span className="flex w-full justify-between font-black text-white" aria-hidden="true">
        {brandLetters("cloud")}
      </span>
    </span>
  );
}

/**
 * Splits a word into per-letter `<span>`s for the justified brand print.
 *
 * @param word - The brand word to lay out letter by letter.
 * @returns One `aria-hidden` `<span>` per letter, keyed by the letter.
 */
function brandLetters(word: string) {
  return word.split("").map((letter) => (
    <span aria-hidden="true" key={letter}>
      {letter}
    </span>
  ));
}
