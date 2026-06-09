/**
 * Pixel-band geometry contract for the VFD module.
 *
 * The VFD is a hardware emulation, not a fluid text layout. A row is a single
 * x*7 pixel band. Glyphs are 5 columns wide and adjacent glyphs are separated
 * by one blank pixel column in that same band. Every coordinate below is an
 * integer in pixel-band space. Avoid fractions, CSS percentage sizing, or
 * layout-derived subpixels in the glyph pipeline. If the display ever needs
 * to scale visually, scale the pixel size by an integer factor (1x1, 2x2,
 * 3x3, ...), then recompute these derived integer dimensions from that scale.
 */
export const VFD_PIXEL_SIZE = 1;
const VFD_PIXEL_GAP = 1;
export const VFD_DOT_PITCH = VFD_PIXEL_SIZE + VFD_PIXEL_GAP;
export const VFD_GLYPH_COLUMNS = 5;
export const VFD_GLYPH_ROWS = 7;
const VFD_GLYPH_SPACING_COLUMNS = 1;
export const VFD_CELL_COLUMNS = VFD_GLYPH_COLUMNS + VFD_GLYPH_SPACING_COLUMNS;
export const VFD_BAND_HEIGHT = VFD_GLYPH_ROWS * VFD_PIXEL_SIZE + (VFD_GLYPH_ROWS - 1) * VFD_PIXEL_GAP;
export const VFD_FULL_COLUMN_MASK = (1 << VFD_GLYPH_ROWS) - 1;
export const VFD_ROW_GAP = 11;

/**
 * Measures the inner content box of a VFD wrapper element.
 *
 * Subtracts CSS padding from the element's bounding rect and floors the
 * result so the caller never asks the column-fit math to deal with subpixel
 * widths. Returns 0/0 if padding is wider than the rect (defensive clamp).
 *
 * @param element The VFD section element being measured.
 * @returns Integer content-box width and height in CSS pixels.
 */
export function vfdContentBox(element: HTMLElement): { width: number; height: number } {
  const style = window.getComputedStyle(element);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(0, Math.floor(rect.width - paddingLeft - paddingRight)),
    height: Math.max(0, Math.floor(rect.height - paddingTop - paddingBottom)),
  };
}

/**
 * Returns the total pixel-column count used by `cellCount` glyph cells.
 *
 * Accounts for inter-glyph spacing columns; the trailing spacing column
 * after the last cell is omitted because it would never be rendered.
 */
export function vfdColumnCountForCells(cellCount: number): number {
  const safeCellCount = Math.max(1, cellCount);
  return safeCellCount * VFD_CELL_COLUMNS - VFD_GLYPH_SPACING_COLUMNS;
}

/**
 * Returns the total CSS pixel width of a pixel band that is `columnCount`
 * columns wide, including the gaps between columns.
 */
function vfdPixelBandWidth(columnCount: number): number {
  const safeColumnCount = Math.max(1, columnCount);
  return safeColumnCount * VFD_PIXEL_SIZE + (safeColumnCount - 1) * VFD_PIXEL_GAP;
}

/**
 * Returns the CSS pixel pitch between the first columns of two adjacent
 * glyph cells, i.e. how much horizontal space each additional cell adds to
 * the row width after the first cell has already been allocated.
 */
function vfdCellPitchWidth(): number {
  return VFD_CELL_COLUMNS * VFD_DOT_PITCH;
}

/**
 * Returns the maximum number of whole glyph cells that fit into the
 * available CSS pixel width.
 *
 * Reserves enough columns for the first complete cell, then divides the
 * remaining width by the per-cell pitch. Always returns at least 1 so the
 * matrix never collapses to zero columns.
 */
export function vfdCellCountForContentWidth(availableWidth: number): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
  const firstCellWidth = vfdPixelBandWidth(VFD_GLYPH_COLUMNS);
  if (availableWidth <= firstCellWidth) return 1;
  return Math.max(1, Math.floor((Math.floor(availableWidth) - firstCellWidth) / vfdCellPitchWidth()) + 1);
}

/**
 * Returns the maximum number of whole rows that fit into the available CSS
 * pixel height, accounting for `VFD_ROW_GAP` between rows. Falls back to
 * `fallbackRows` when the height is unknown or invalid.
 */
export function vfdRowCountForContentHeight(availableHeight: number, fallbackRows: number): number {
  if (!Number.isFinite(availableHeight) || availableHeight <= 0) return fallbackRows;
  return Math.max(1, Math.floor((Math.floor(availableHeight) + VFD_ROW_GAP) / (VFD_BAND_HEIGHT + VFD_ROW_GAP)));
}

/** Returns the CSS pixel width of a row that displays `cellCount` glyph cells. */
export function vfdRowWidth(cellCount: number): number {
  return vfdPixelBandWidth(vfdColumnCountForCells(cellCount));
}

/**
 * Returns the CSS pixel height of a display showing `rowCount` rows,
 * including `VFD_ROW_GAP` between rows. Clamped to at least one row.
 */
export function vfdDisplayHeight(rowCount: number): number {
  const safeRowCount = Math.max(1, rowCount);
  return safeRowCount * VFD_BAND_HEIGHT + (safeRowCount - 1) * VFD_ROW_GAP;
}

/**
 * Coerces an optional number into a positive integer with a fallback.
 *
 * Returns `fallback` when the value is undefined or non-finite, otherwise
 * floors it and clamps to a minimum of 1. Used to harden every caller-facing
 * matrix dimension against `NaN`, fractional values, or zero inputs.
 */
export function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value ?? fallback));
}
