import type { VinylLayout } from "@musiccloud/shared";
import { type CSSProperties, type HTMLAttributes, type ReactNode, useCallback } from "react";
import { KnobDial } from "@/components/turntable/KnobDial";
import { type RecordLabel, RecordSwapStage } from "@/components/turntable/RecordSwapStage";
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
import { sideForTrackTitle } from "@/lib/media/vinyl-side.js";
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

/** Shared dark retaining ring around both classic domed pilot lamps. */
const INDICATOR_LAMP_BEZEL_STYLE = {
  boxShadow:
    "0 0 0 1px rgba(0,0,0,0.92), 0 0 0 2px rgba(90,98,108,0.32), -1px -1px 0 rgba(255,255,255,0.17), 1px 2px 3px rgba(0,0,0,0.78), inset 0 0 0 1px rgba(255,255,255,0.13), inset 0 0 0 2px rgba(0,0,0,0.76)",
} satisfies CSSProperties;

/** Glass specular aligned with the deck's shared upper-left light source. */
const INDICATOR_LAMP_HIGHLIGHT_STYLE = {
  background:
    "radial-gradient(ellipse at 24% 20%, rgba(255,255,255,0.92) 0 5%, rgba(255,255,255,0.42) 6% 11%, rgba(255,255,255,0.12) 14%, transparent 25%)",
} satisfies CSSProperties;

const INDICATOR_LAMP_GLASS_SHADOW =
  "inset 1px 1px 1px rgba(255,255,255,0.34), inset -1px -2px 2px rgba(0,0,0,0.82), inset 0 0 2px rgba(0,0,0,0.55)";

interface IndicatorLampPalette {
  /** Coloured glass and concentrated emitter beneath it. */
  lensBackground: string;
  /** Compact coloured halo emitted only while the lamp is lit. */
  litGlow: string;
}

const POWER_LAMP_PALETTE = {
  lensBackground:
    "radial-gradient(circle at 50% 58%, #d9ffe0 0 7%, #82f597 12%, #32c65b 32%, #0c7132 62%, #03160b 100%)",
  litGlow:
    "0 0 3px rgba(112,255,137,0.5), 0 0 8px rgba(48,210,83,0.22), 0 0 14px rgba(48,210,83,0.11), 0 0 22px rgba(48,210,83,0.04)",
} satisfies IndicatorLampPalette;

const LAYOUT_LAMP_PALETTE = {
  lensBackground:
    "radial-gradient(circle at 50% 58%, #fff2cd 0 7%, #ffc96b 12%, #ed8b29 32%, #8c3e0c 62%, #241004 100%)",
  litGlow:
    "0 0 3px rgba(255,198,104,0.52), 0 0 8px rgba(242,138,32,0.22), 0 0 14px rgba(242,138,32,0.11), 0 0 22px rgba(242,138,32,0.04)",
} satisfies IndicatorLampPalette;

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

/** Props for the shared physical pilot-lamp presentation. */
interface TurntableIndicatorLampProps extends HTMLAttributes<HTMLSpanElement> {
  /** Whether the emitter beneath the tinted glass is energised. */
  isLit: boolean;
  /** Colour-specific glass and compact halo values. */
  palette: IndicatorLampPalette;
}

/**
 * Classic domed equipment lamp shared by the power and Discogs indicators.
 *
 * The retaining bezel never fades. The glass keeps a dark colour tint while
 * switched off; energising the lamp brightens the concentrated centre and adds
 * only a compact halo. A fixed upper-left highlight and lower-right inset shade
 * give the lens its physical dome under the deck's common light source.
 */
function TurntableIndicatorLamp({ isLit, palette, className, ...props }: TurntableIndicatorLampProps) {
  return (
    <span
      className={cn("absolute bottom-[6%] z-10 aspect-square w-[3.2%] overflow-visible rounded-full", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full transition-[filter,box-shadow] duration-300"
        data-turntable-lamp-lens="true"
        style={{
          background: palette.lensBackground,
          boxShadow: isLit ? `${INDICATOR_LAMP_GLASS_SHADOW}, ${palette.litGlow}` : INDICATOR_LAMP_GLASS_SHADOW,
          filter: isLit ? "saturate(1) brightness(1)" : "saturate(0.58) brightness(0.48)",
        }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full transition-opacity duration-300"
          data-turntable-lamp-highlight="true"
          style={{ ...INDICATOR_LAMP_HIGHLIGHT_STYLE, opacity: isLit ? 1 : 0.38 }}
        />
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full"
        data-turntable-lamp-bezel="true"
        style={INDICATOR_LAMP_BEZEL_STYLE}
      />
    </span>
  );
}

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
    <TurntableIndicatorLamp
      aria-hidden="true"
      className="right-[6.2%]"
      data-turntable-led="true"
      data-turntable-led-power={power}
      isLit={isOn}
      palette={POWER_LAMP_PALETTE}
    />
  );
}

/** Props for {@link TurntablePlayerLayoutLed}. */
interface TurntablePlayerLayoutLedProps {
  /** Persisted Discogs layout for the inserted album; absent layouts leave the lamp off. */
  vinylLayout?: VinylLayout | null;
}

/**
 * Orange Discogs-layout LED, positioned directly left of the green power LED.
 *
 * The lamp is lit precisely when the inserted record has a persisted
 * {@link VinylLayout}. Its status deliberately does not depend on playback or
 * the side currently on the platter. Decorative only, it is hidden from assistive
 * technology and exposes its state through `data-turntable-layout-led-state` for
 * focused tests.
 *
 * @param props - {@link TurntablePlayerLayoutLedProps}.
 */
export function TurntablePlayerLayoutLed({ vinylLayout }: TurntablePlayerLayoutLedProps) {
  const isLit = Boolean(vinylLayout);
  return (
    <TurntableIndicatorLamp
      aria-hidden="true"
      className="right-[10.9%]"
      data-turntable-layout-led="true"
      data-turntable-layout-led-state={isLit ? "lit" : "off"}
      isLit={isLit}
      palette={LAYOUT_LAMP_PALETTE}
    />
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
  /**
   * Fired once the arc swap settles the new record on the spindle. The
   * hub-connected {@link HubPlatter} wires this to a best-effort play so the new
   * record starts after it lands; the standalone deck omits it.
   */
  onSettled?: () => void;
}

/**
 * The rotating-disc assembly: the recessed platter shadow, the {@link VinylRecord}
 * itself (fed `spinState`), the spindle contact shadow and the chrome spindle.
 *
 * The platter disc, spindle and its shadow are decorative deck chrome; the record
 * carries its own accessible name. All layers keep their original
 * `data-turntable-*` attributes so existing selectors and tests still match.
 *
 * The spindle + contact shadow are handed to {@link RecordSwapStage} as its
 * `centerpiece` rather than being a deck sibling: the stage draws them ABOVE the
 * resting record but BELOW a record mid-swap, so the chrome never floats over a
 * disc that has lifted off the spindle. Their widths are the deck-relative 2.15% /
 * 2.7% divided by the stage's 86% span (`≈ 2.5%` / `≈ 3.14%`), so the rendered size
 * on the deck is unchanged; both stay centred.
 *
 * @param props - {@link TurntablePlayerPlatterProps}.
 */
export function TurntablePlayerPlatter({ spinState, record, swapKey, onSettled }: TurntablePlayerPlatterProps) {
  const { className: recordClassName, sideLayout, ...labelRecord } = record;
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
          sideLayout={sideLayout}
          spinState={spinState}
          swapKey={swapKey}
          onSettled={onSettled}
          className={cn("h-full w-full", recordClassName)}
        >
          {/* Spindle centrepiece (children), sized deck-relative ÷ 0.86 so the
              rendered size is unchanged. Contact shadow DOM-before the spindle so
              it paints beneath it; the stage flips both under the records mid-swap. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[3.14%] rounded-full"
            data-turntable-spindle-shadow="true"
            style={SPINDLE_SHADOW_STYLE}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[2.5%] -translate-x-1/2 -translate-y-1/2 rounded-full"
            data-turntable-spindle="true"
            style={SPINDLE_STYLE}
          />
        </RecordSwapStage>
      </span>
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

/** Record props for the hub-driven deck, including its stage-owned CSS sizing. */
type HubRecord = RecordLabel & Pick<VinylRecordProps, "className">;

/** Props for {@link HubPlatter}: the platter needs the record; spin comes from the hub. */
interface HubPlatterProps {
  /** The inserted record; `spinState` and the current track title come from the hub. */
  record: HubRecord;
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

/** Props for {@link HubLayoutLed}. */
interface HubLayoutLedProps {
  /** Persisted Discogs layout of the record currently inserted on the deck. */
  vinylLayout?: VinylLayout | null;
}

/**
 * Hub-composed {@link TurntablePlayerLayoutLed} for the root deck.
 *
 * The layout is record data rather than transport state, so this compound part
 * receives it directly from {@link TurntablePlayerRoot} instead of reading the
 * playback hub.
 *
 * @param props - {@link HubLayoutLedProps}.
 */
export function HubLayoutLed({ vinylLayout }: HubLayoutLedProps) {
  return <TurntablePlayerLayoutLed vinylLayout={vinylLayout} />;
}

/**
 * Hub-connected {@link TurntablePlayerPlatter}: reads `spinState` from the
 * turntable hub and feeds it to the {@link VinylRecord}, and starts the freshly
 * swapped-in record once it settles.
 *
 * The record-swap defer (see `useAudioController`) stops playback and leaves the
 * new source idle while the deck coasts and the arc swap runs, so `onSettled`
 * begins playback once the new disc lands. This is the product's "always auto-play
 * the new record after the swap" decision; it is best effort — `togglePlay` calls
 * `audio.play()`, whose promise rejection the engine already downgrades to an idle
 * unavailable state, so a browser autoplay block simply leaves the record resting.
 * The `isPlaying` guard avoids pausing a deck that is already playing (a same-album
 * or reduced-motion path never reaches settle, but the guard keeps the intent
 * explicit).
 *
 * Must render inside a `TurntablePlayerProvider`.
 *
 * @param props - {@link HubPlatterProps}.
 */
export function HubPlatter({ record, swapKey }: HubPlatterProps) {
  const { spinState, isPlaying, togglePlay, trackTitle } = useTurntablePlayer();
  const handleSettled = useCallback(() => {
    if (!isPlaying) togglePlay();
  }, [isPlaying, togglePlay]);
  const { defaultSideLayout, vinylLayout, ...vinylRecord } = record;
  const sideLayout = sideForTrackTitle(vinylLayout, trackTitle) ?? defaultSideLayout;
  return (
    <TurntablePlayerPlatter
      record={{ ...vinylRecord, sideLayout }}
      spinState={spinState}
      swapKey={swapKey}
      onSettled={handleSettled}
    />
  );
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
  record: HubRecord;
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
      <HubLayoutLed vinylLayout={record.vinylLayout} />
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
