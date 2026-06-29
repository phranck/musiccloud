import {
  HubControl,
  HubLed,
  HubPlatter,
  TurntablePlayerKnob,
  TurntablePlayerKnobLabels,
  TurntablePlayerRoot,
} from "@/components/turntable/TurntablePlayerParts";

/**
 * `TurntablePlayer` compound: the hub-driven turntable deck and its parts.
 *
 * The root renders the full deck wired to the `useTurntablePlayer` hub. The
 * attached parts let a caller compose the deck piecemeal, each reading its slice
 * of the hub:
 * - `TurntablePlayer.LED` — the power lamp (reads `power`).
 * - `TurntablePlayer.Platter` — the disc + spindle assembly (reads `speed`/`spinState`).
 * - `TurntablePlayer.Control` — the speed cluster (reads `speed`); it carries
 *   `Control.Knob` (the dial, prop-driven) and `Control.KnobLabels` (the static
 *   captions) for callers that need the bare presentational pieces.
 *
 * Assembled with `Object.assign` in this `.ts` module (mirroring `Player.ts`) so
 * the namespace value stays out of the `.tsx` parts file, which exports only
 * components.
 */
export const TurntablePlayer = Object.assign(TurntablePlayerRoot, {
  LED: HubLed,
  Platter: HubPlatter,
  Control: Object.assign(HubControl, {
    Knob: TurntablePlayerKnob,
    KnobLabels: TurntablePlayerKnobLabels,
  }),
});
