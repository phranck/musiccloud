import type { CSSProperties, ReactNode } from "react";
import { KnobDial } from "@/components/turntable/KnobDial";
import { RecordSwapStage } from "@/components/turntable/RecordSwapStage";
import {
  TurntablePower,
  type TurntablePower as TurntablePowerValue,
  TurntableSpeed,
  type TurntableSpeed as TurntableSpeedValue,
  useTurntablePlayer,
} from "@/components/turntable/TurntablePlayerContext";
import { derivePower, speedKnobAngle } from "@/components/turntable/turntableState";
import type { VinylRecordProps } from "@/components/vinyl/VinylRecord";
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
 * Lamp opacity when the deck is stopped (`power === Standby`).
 *
 * Subtly dims the green lamp so a stopped deck reads as "off" without removing
 * the lamp. The `On` state keeps full opacity (the accepted lit optic, unchanged
 * byte-for-byte). Opacity-only so the dim composites on the GPU.
 */
const LED_STANDBY_OPACITY = 0.32;

/**
 * Soft outer-glow opacity when stopped. Pushed lower than the lamp so the halo
 * around the dimmed lamp all but disappears, reinforcing the "off" read while
 * the `On` glow stays at its full optic.
 */
const LED_GLOW_STANDBY_OPACITY = 0.12;

/** Props for {@link TurntablePlayerLed}. */
interface TurntablePlayerLedProps {
  /**
   * Current power state, surfaced on `data-turntable-led-power` so the hub
   * coupling is observable. `On` renders the full lit optic; `Standby` dims the
   * lamp and its glow via opacity (GPU-only), reading as "off".
   */
  power: TurntablePowerValue;
}

/**
 * The deck power LED: a small round lamp pinned to the bottom-right of the deck.
 *
 * Renders the green gradient plus the soft outer glow. At `On` (a playing speed)
 * it shows the full lit optic, exactly the look the former decorative LED carried;
 * at `Standby` (stopped) the lamp and glow dim via opacity so the deck reads as
 * off. Only opacity changes between the two states, so the dim composites on the
 * GPU and the `On` optic stays untouched. The live `power` is exposed on
 * `data-turntable-led-power`. Decorative, so it stays `aria-hidden`; selected in
 * tests via `data-turntable-led`.
 *
 * @param props - {@link TurntablePlayerLedProps}.
 */
export function TurntablePlayerLed({ power }: TurntablePlayerLedProps) {
  const isOn = power === TurntablePower.On;
  return (
    <span
      aria-hidden="true"
      className="absolute right-[6.2%] bottom-[6%] z-40 aspect-square w-[calc(2.1%_-_1px)] overflow-visible rounded-full transition-opacity duration-300"
      data-turntable-led="true"
      data-turntable-led-power={power}
      style={{ ...LED_STYLE, opacity: isOn ? 1 : LED_STANDBY_OPACITY }}
    >
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -z-10 aspect-square w-[430%] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-300"
        style={{ ...LED_GLOW_STYLE, opacity: isOn ? 1 : LED_GLOW_STANDBY_OPACITY }}
      />
    </span>
  );
}

/** Props for {@link TurntablePlayerPlatter}. */
interface TurntablePlayerPlatterProps {
  /** Visual spin state forwarded to the resting record. */
  spinState: VinylSpinStateValue;
  /** The vinyl label/record props (artwork, title, catalog, ...). */
  record: Omit<VinylRecordProps, "spinState">;
  /** Identity of the current record; a change runs the arc swap (see {@link RecordSwapStage}). */
  swapKey: string;
}

/**
 * The rotating-disc assembly: the recessed platter shadow, the {@link VinylRecord}
 * itself (fed `spinState`), the spindle contact shadow and the chrome spindle on
 * top.
 *
 * The platter disc, spindle and its shadow are decorative deck chrome; the record
 * carries its own accessible name. All four layers keep their original
 * `data-turntable-*` attributes so existing selectors and tests still match.
 *
 * @param props - {@link TurntablePlayerPlatterProps}.
 */
export function TurntablePlayerPlatter({ spinState, record, swapKey }: TurntablePlayerPlatterProps) {
  const { className: recordClassName, ...labelRecord } = record;
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 z-10 aspect-square w-[calc(86%_-_4px)] -translate-x-1/2 -translate-y-1/2 rounded-full"
        data-turntable-platter="true"
        style={PLATTER_STYLE}
      />

      <span className="absolute left-1/2 top-1/2 z-20 aspect-square w-[86%] -translate-x-1/2 -translate-y-1/2">
        <RecordSwapStage
          record={labelRecord}
          spinState={spinState}
          swapKey={swapKey}
          className={cn("h-full w-full", recordClassName)}
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
 * Lit caption style for the active speed ("33"/"45" when selected): a bright
 * white with a soft white glow so the chosen detent reads as illuminated. Pure
 * colour + text-shadow, so it composites cheaply.
 */
const LABEL_SPEED_LIT_STYLE = {
  color: "#ffffff",
  textShadow: "0 0 6px rgba(255,255,255,0.55), 0 0 2px rgba(255,255,255,0.85)",
} satisfies CSSProperties;

/**
 * Lit caption style for "ON" while the deck is powered (any playing speed): a
 * subdued amber with a soft glow, the classic powered-indicator tint. Stays lit
 * for both 33 and 45 (any `power === On`), independent of which one is selected.
 */
const LABEL_POWER_LIT_STYLE = {
  color: "#ff9f4a",
  textShadow: "0 0 6px rgba(255,150,60,0.5), 0 0 2px rgba(255,150,60,0.8)",
} satisfies CSSProperties;

/** Props for {@link TurntablePlayerKnobLabels}. */
interface TurntablePlayerKnobLabelsProps {
  /**
   * The active speed. Lights the "33" caption white while playing and the "ON"
   * caption amber whenever the deck is powered. Defaults to `Standby` (every
   * caption at its unlit deck-print tint) so the decorative standalone deck can
   * render the labels without a speed.
   */
  speed?: TurntableSpeedValue;
}

/**
 * Static speed captions printed beside the knob: "33", "45", "ON", "STANDBY".
 *
 * The captions are fixed deck print at the accepted box-relative coordinates.
 * "33" glows white while playing and "ON" glows amber whenever the deck is
 * powered, mirroring a real deck's lit indicators. "45" and "STANDBY" have no lit
 * state — the deck runs at a single speed, so "45" stays a permanent unlit print
 * (kept for the authentic deck face) and "STANDBY" marks the powered-off rest. A
 * short transition eases the lit captions on and off. Rendered inside
 * {@link TurntablePlayerControl}.
 *
 * @param props - {@link TurntablePlayerKnobLabelsProps}.
 */
export function TurntablePlayerKnobLabels({ speed = TurntableSpeed.Standby }: TurntablePlayerKnobLabelsProps) {
  const isPowered = derivePower(speed) === TurntablePower.On;
  return (
    <>
      <span
        className="absolute left-[13.6%] top-[41%] -translate-y-full whitespace-nowrap transition-[color,text-shadow] duration-200"
        style={speed === TurntableSpeed.Rpm33 ? LABEL_SPEED_LIT_STYLE : undefined}
      >
        33
      </span>
      {/* "45" is a permanent unlit deck print: the deck runs at a single speed, so
          this caption never lights. It stays for the authentic deck face. */}
      <span className="absolute left-[34.5%] top-[24.3%] -translate-y-full whitespace-nowrap">45</span>
      <span
        className="absolute left-[15.5%] top-[63.5%] -translate-x-full -translate-y-1/2 whitespace-nowrap transition-[color,text-shadow] duration-200"
        style={isPowered ? LABEL_POWER_LIT_STYLE : undefined}
      >
        ON
      </span>
      <span className="absolute left-[23.7%] top-[91.8%] -translate-x-full whitespace-nowrap">STANDBY</span>
    </>
  );
}

/** Props for {@link TurntablePlayerKnob}. */
interface TurntablePlayerKnobProps {
  /** Current speed; positions the indicator line via {@link speedKnobAngle}. */
  speed: TurntableSpeedValue;
}

/**
 * The decorative speed knob: a round dial whose indicator points at the active
 * speed's caption, with no input handling.
 *
 * Used by the standalone, prop-driven `Turntable` deck where there is no hub to
 * drive interaction; the hub-connected deck uses the interactive
 * {@link TurntableKnob} instead. Renders through the shared {@link KnobDial}, so
 * the dial chrome and the `data-turntable-speed-knob` / `-speed-indicator` hooks
 * stay in one place. `aria-hidden` because it is purely indicative.
 *
 * @param props - {@link TurntablePlayerKnobProps}.
 */
export function TurntablePlayerKnob({ speed }: TurntablePlayerKnobProps) {
  return <KnobDial aria-hidden="true" indicatorAngleDeg={speedKnobAngle(speed)} />;
}

/** Props for {@link TurntablePlayerControl}. */
interface TurntablePlayerControlProps {
  /**
   * The active speed, forwarded to {@link TurntablePlayerKnobLabels} so the
   * captions light up. Defaults to `Standby` (no caption lit).
   */
  speed?: TurntableSpeedValue;
  /**
   * The knob rendered in the cluster: the decorative {@link TurntablePlayerKnob}
   * (prop-driven `Turntable` deck) or the interactive {@link TurntableKnob}
   * (hub-driven {@link HubControl}).
   */
  children: ReactNode;
}

/**
 * The speed-control cluster: the positioned label box holding the static
 * {@link TurntablePlayerKnobLabels} captions and a knob.
 *
 * This is the layout container the former `Turntable` rendered as a single
 * bottom-left `<span>`; the captions and knob keep their exact coordinates so the
 * optic is unchanged. The caller supplies the knob as children — the decorative
 * one or the interactive one — so the cluster layout stays in one place.
 *
 * @param props - {@link TurntablePlayerControlProps}.
 */
export function TurntablePlayerControl({ speed, children }: TurntablePlayerControlProps) {
  return (
    <span className="absolute bottom-[3.1%] left-[calc(3.1%_+_5px)] z-30 aspect-square w-[19%] font-condensed text-[clamp(0.32rem,1.24vw,0.45rem)] font-bold leading-none tracking-[0.03em] text-white/70">
      <TurntablePlayerKnobLabels speed={speed} />
      {children}
    </span>
  );
}

/** Props for {@link HubPlatter}: the platter needs the record; spin comes from the hub. */
interface HubPlatterProps {
  /** The vinyl label/record props; `spinState` comes from the hub. */
  record: Omit<VinylRecordProps, "spinState">;
  /** Identity of the current record; a change runs the arc swap. */
  swapKey: string;
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
 * Hub-connected {@link TurntablePlayerPlatter}: reads `spinState` from the
 * turntable hub and feeds it to the {@link VinylRecord}.
 *
 * Must render inside a `TurntablePlayerProvider`.
 *
 * @param props - {@link HubPlatterProps}.
 */
export function HubPlatter({ record, swapKey }: HubPlatterProps) {
  const { spinState } = useTurntablePlayer();
  return <TurntablePlayerPlatter record={record} spinState={spinState} swapKey={swapKey} />;
}

/**
 * Hub-connected speed-control cluster: the lit captions plus the animated
 * indicator knob.
 *
 * Reads the live `speed` from the hub so the "33"/"ON" captions light while
 * playing and the knob indicator glides between STANDBY and 33. The knob is a
 * pure indicator — playback is driven by the playbutton/spacebar, not the deck.
 * Must render inside a `TurntablePlayerProvider`. The standalone `Turntable` deck
 * instead passes an explicit `speed` plus a static decorative knob to
 * {@link TurntablePlayerControl}.
 */
export function HubControl() {
  const { speed } = useTurntablePlayer();
  return (
    <TurntablePlayerControl speed={speed}>
      <KnobDial aria-hidden="true" animated gpuLayer indicatorAngleDeg={speedKnobAngle(speed)} />
    </TurntablePlayerControl>
  );
}

/** Props for {@link TurntablePlayerRoot}. */
interface TurntablePlayerRootProps {
  /** Extra classes merged onto the deck figure. */
  className?: string;
  /** The vinyl label/record props; the platter pulls `speed`/`spinState` from the hub. */
  record: Omit<VinylRecordProps, "spinState" | "speed">;
  /** Identity of the current record; a change runs the arc swap. */
  swapKey: string;
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
export function TurntablePlayerRoot({ className, record, swapKey }: TurntablePlayerRootProps) {
  return (
    <TurntablePlayerSurface className={className}>
      <HubPlatter record={record} swapKey={swapKey} />
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
 * Decorative deck branding ("music" over "cloud") printed in the top-left corner.
 *
 * Exposed as `TurntablePlayer.Brand` so callers can place the wordmark on a
 * bespoke deck layout; the default {@link TurntablePlayerSurface} already renders
 * it. Needs no hub, so it works on the standalone deck too. `aria-hidden` because
 * the whole turntable is already named by the figure's `aria-label`; a per-letter
 * screen-reader readout would only add noise. Selected in tests via
 * `data-turntable-brand`.
 */
export function TurntablePlayerBrand() {
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
