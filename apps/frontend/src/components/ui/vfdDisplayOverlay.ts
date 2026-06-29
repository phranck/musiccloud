import {
  type VfdCanvasPixelColumn,
  type VfdCanvasRenderState,
  type VfdDisplayLine,
  type VfdOverlayRuntimeState,
  VfdScrollOutDirection,
} from "@/components/ui/VfdDisplayTypes";

/**
 * Cubic ease-out: fast start, gentle settle.
 *
 * Maps `0 → 0` and `1 → 1`. Input is clamped to `[0, 1]` before the curve is
 * applied, so callers do not need to pre-clamp their progress values.
 *
 * @param progress - Normalised animation progress in `[0, 1]` (clamped internally).
 * @returns Eased output in `[0, 1]`.
 */
export function easeOutCubic(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return 1 - (1 - clamped) ** 3;
}

/**
 * Start column of the overlay's pixel buffer for the current progress.
 *
 * At `progress = 0` the overlay sits centered behind the row content (hidden
 * under the standing text). At `progress = 1` it has fully exited the row
 * toward `direction`: a `Left` overlay ends at column `−overlayCols` (fully
 * off-screen left) and a `Right` overlay starts at column `rowColumns` (fully
 * off-screen right).
 *
 * @param direction - Which side the overlay scrolls toward.
 * @param progress - Normalised animation progress in `[0, 1]`.
 * @param rowColumns - Total pixel-column width of the row.
 * @param overlayColumns - Pixel-column width of the overlay glyph buffer.
 * @returns The first pixel column at which the overlay buffer should be drawn.
 */
export function scrollOutStartColumn(
  direction: VfdScrollOutDirection,
  progress: number,
  rowColumns: number,
  overlayColumns: number,
): number {
  const centerStart = Math.round((rowColumns - overlayColumns) / 2);
  const eased = easeOutCubic(progress);
  if (direction === VfdScrollOutDirection.Left) {
    return Math.round(centerStart - eased * (centerStart + overlayColumns));
  }
  return Math.round(centerStart + eased * (rowColumns - centerStart));
}

/**
 * Arms or re-arms the per-row overlay when a line carries a scroll-out overlay
 * with a nonce differing from the running one. Mirrors the transition-arming in
 * `syncRenderStateLines`. Removes the entry when the line drops its overlay.
 *
 * @param state - The mutable canvas render state owning the overlay map.
 * @param line - The normalized line, checked for a `scrollOutOverlay` field.
 * @param rowIndex - Zero-based row index used as the map key.
 * @param now - Current `performance.now()` timestamp used as `startedAt`.
 */
export function syncOverlayState(
  state: VfdCanvasRenderState,
  line: Pick<VfdDisplayLine, "scrollOutOverlay">,
  rowIndex: number,
  now: number,
): void {
  const overlay = line.scrollOutOverlay;
  if (!overlay) {
    state.overlays.delete(rowIndex);
    return;
  }
  const running = state.overlays.get(rowIndex);
  if (running && running.nonce === overlay.nonce) return;
  state.overlays.set(rowIndex, {
    text: overlay.text,
    direction: overlay.direction,
    durationMs: overlay.durationMs,
    nonce: overlay.nonce,
    startedAt: now,
  });
}

/**
 * Merges overlay columns behind foreground columns. Foreground (lit) pixels win.
 *
 * Inside the foreground's lit span (`[textFirst, textLast]`) the gaps stay
 * blank so the standing text occludes the overlay solidly — no glyph
 * inter-column bleed-through. Outside that span the overlay shows through
 * wherever the foreground column has no lit pixels (`mask === 0`).
 *
 * @param foreground - Full-width pixel-column array for the row's normal content.
 * @param overlay - Full-width pixel-column array built from the overlay glyph buffer.
 * @param textFirst - First column index in `foreground` that has a lit pixel (`mask !== 0`).
 * @param textLast - Last column index in `foreground` that has a lit pixel.
 * @returns A merged column array the same length as `foreground`.
 */
export function mergeOverlayColumns(
  foreground: VfdCanvasPixelColumn[],
  overlay: VfdCanvasPixelColumn[],
  textFirst: number,
  textLast: number,
): VfdCanvasPixelColumn[] {
  return foreground.map((fg, index) => {
    if (fg.mask !== 0) return fg;
    if (index >= textFirst && index <= textLast) return fg;
    return overlay[index] ?? fg;
  });
}

/**
 * Progress of a running overlay, clamped to `[0, 1]`.
 *
 * @param overlay - The runtime state entry from `VfdCanvasRenderState.overlays`.
 * @param now - Current `performance.now()` timestamp.
 * @returns A value in `[0, 1]` where `1` means the animation is complete.
 */
export function overlayProgress(overlay: VfdOverlayRuntimeState, now: number): number {
  return Math.max(0, Math.min(1, (now - overlay.startedAt) / overlay.durationMs));
}
