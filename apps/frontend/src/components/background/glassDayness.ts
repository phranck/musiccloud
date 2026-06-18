/**
 * Main-thread sink for the night-sky reverse dayness channel.
 *
 * The night-sky driver owns the authoritative day amount (`settings.dayness`,
 * 0 = night … 1 = day) and mutates it inside the render worker. This module is
 * the single place the main thread mirrors that value into the DOM so the glass
 * material cross-fades in lockstep with the sky.
 *
 * Every CSS-driven surface — cards, buttons, recessed wells, the segmented
 * control, and the text levels (`--color-text-*` are re-pointed at
 * `color-mix()` on `--g-dayness` in `glass.css`) — reads `--g-dayness`
 * live, so setting the one custom property is the entire main-thread cost: no
 * per-element JS, no layout, no allocation beyond the property write.
 *
 * Elements CSS `color-mix()` cannot reach (the VFD phosphor canvas, the TFT
 * cover gradients, the footer text stroke, the overlay backdrop scrim) are NOT
 * driven here: in production those are distinct hardware-palette components
 * (`VfdDisplay`, `TftScreen`, `AppFooter`, `OverlayBackdrop`) the plan keeps
 * opaque / on their own palette. Wiring their day↔night lerp is a separate,
 * per-component pass and would otherwise only emit unread variables here.
 *
 * Wiring: the worker render path calls {@link publishGlassDayness} from its
 * `Dayness` message handler; the main-thread fallback path passes it straight
 * to the driver as its `onDayness` sink. Never read `settings.dayness` directly
 * from the main thread — this channel is the only sanctioned read path.
 */

/**
 * Window event fired after `--g-dayness` changes. Canvas-based surfaces that
 * cache resolved colours (the VFD phosphor) listen for it to re-resolve and
 * redraw, since a `<canvas>` cannot read a live CSS `color-mix()`.
 */
export const DAYNESS_EVENT = "mc:dayness";

/**
 * Mirrors the live day amount into `--g-dayness`, driving every CSS
 * `color-mix()`/`calc()` cross-fade of the glass material, then fires
 * {@link DAYNESS_EVENT} for canvas consumers. Clamped to [0,1]; a no-op under
 * SSR (no `document`).
 *
 * @param dayness The live day amount from the driver (0 = night, 1 = day).
 */
export function publishGlassDayness(dayness: number): void {
  if (typeof document === "undefined") return;
  const d = Math.max(0, Math.min(1, dayness));
  document.documentElement.style.setProperty("--g-dayness", String(d));
  window.dispatchEvent(new Event(DAYNESS_EVENT));
}
