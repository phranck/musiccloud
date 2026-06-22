import { clampViewportRect, type ViewportRect, type ViewportRectConstraints } from "@musiccloud/shared";

// Default + limits for the draggable / resizable overlay frame.
const DEFAULT_W = 520;
const DEFAULT_H = 600;
const MIN_W = 320;
const MIN_H = 240;
const VIEWPORT_MARGIN = 8;

// Geometry is persisted per-page slug so the user's preferred size and
// position for one page (e.g. "help") does not bleed over into another
// page (e.g. "info"). One localStorage entry per slug.
const GEOM_KEY_PREFIX = "mc:overlay-geom:";

/**
 * Persisted overlay frame geometry: top-left position (`x`/`y`) and size
 * (`w`/`h`) in CSS pixels. The localStorage shape the persistence helpers parse
 * and validate.
 */
export interface Geom {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Build the localStorage key for a page slug's persisted geometry.
 *
 * @param slug - the content-page slug whose geometry is stored
 * @returns the namespaced localStorage key
 */
function geomKey(slug: string): string {
  return `${GEOM_KEY_PREFIX}${slug}`;
}

/**
 * Current viewport-based clamp constraints for the overlay frame. Reads
 * `window.innerWidth/innerHeight`, so it must run on the client only.
 *
 * @returns the constraints consumed by the shared viewport-rect math
 */
export function getViewportConstraints(): ViewportRectConstraints {
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    minWidth: MIN_W,
    minHeight: MIN_H,
    margin: VIEWPORT_MARGIN,
  };
}

/**
 * Convert a {@link Geom} into the shared {@link ViewportRect} shape used by the
 * geometry math in `@musiccloud/shared`.
 *
 * @param g - the persisted geometry
 * @returns the equivalent viewport rect
 */
export function geomToRect(g: Geom): ViewportRect {
  return {
    x: g.x,
    y: g.y,
    width: g.w,
    height: g.h,
  };
}

/**
 * Convert a shared {@link ViewportRect} back into the persisted {@link Geom}
 * shape.
 *
 * @param rect - the viewport rect produced by the geometry math
 * @returns the equivalent persisted geometry
 */
export function rectToGeom(rect: ViewportRect): Geom {
  return {
    x: rect.x,
    y: rect.y,
    w: rect.width,
    h: rect.height,
  };
}

/**
 * Clamp a geometry into the current viewport so the frame never sits partially
 * off-screen.
 *
 * @param g - the geometry to clamp
 * @returns the clamped geometry
 */
export function clampGeom(g: Geom): Geom {
  return rectToGeom(clampViewportRect(geomToRect(g), getViewportConstraints()));
}

/**
 * Default centred geometry for a freshly-opened overlay: default size, centred
 * horizontally, near the top vertically, then clamped to the viewport.
 *
 * @returns the default clamped geometry
 */
export function defaultGeom(): Geom {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return clampGeom({
    w: DEFAULT_W,
    h: DEFAULT_H,
    x: Math.round((vw - DEFAULT_W) / 2),
    y: Math.max(24, Math.round(vh * 0.15)),
  });
}

/**
 * Load and validate the persisted geometry for a page slug from localStorage.
 * Returns null when nothing is stored, the value is malformed, or storage is
 * unavailable; a valid value is clamped to the current viewport before return.
 *
 * @param slug - the content-page slug whose geometry to load
 * @returns the clamped persisted geometry, or null when absent/invalid
 */
export function loadGeom(slug: string): Geom | null {
  try {
    const raw = localStorage.getItem(geomKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const g = parsed as Partial<Geom>;
    if (![g.x, g.y, g.w, g.h].every((n) => typeof n === "number" && Number.isFinite(n))) {
      return null;
    }
    return clampGeom(g as Geom);
  } catch {
    return null;
  }
}

/**
 * Persist the geometry for a page slug to localStorage. Failures (quota,
 * disabled storage) are swallowed; geometry simply resets on the next reload.
 *
 * @param slug - the content-page slug whose geometry to store
 * @param g - the geometry to persist
 */
export function saveGeom(slug: string, g: Geom): void {
  try {
    localStorage.setItem(geomKey(slug), JSON.stringify(g));
  } catch {
    // Quota / disabled storage — ignore; geometry will simply reset on reload.
  }
}
