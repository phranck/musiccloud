import {
  HubControl,
  HubLed,
  HubPlatter,
  TurntablePlayerBrand,
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
 * - `TurntablePlayer.Brand` — the decorative "music / cloud" wordmark, top-left (no hub).
 * - `TurntablePlayer.LED` — the power lamp (reads `power`).
 * - `TurntablePlayer.Platter` — the disc + spindle assembly (reads `speed`/`spinState`).
 * - `TurntablePlayer.Control` — the speed cluster: the static captions plus the
 *   interactive `TurntableKnob`, which drags/steps the speed on the hub. It also
 *   carries `Control.Knob` (the bare, prop-driven decorative dial) and
 *   `Control.KnobLabels` (the static captions) for callers that need the
 *   presentational pieces on their own.
 *
 * Assembled with `Object.assign` in this `.ts` module (mirroring `Player.ts`) so
 * the namespace value stays out of the `.tsx` parts file, which exports only
 * components.
 */
export const TurntablePlayer = Object.assign(TurntablePlayerRoot, {
  Brand: TurntablePlayerBrand,
  LED: HubLed,
  Platter: HubPlatter,
  Control: Object.assign(HubControl, {
    Knob: TurntablePlayerKnob,
    KnobLabels: TurntablePlayerKnobLabels,
  }),
});
