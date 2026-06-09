/**
 * Whitespace-cell character used inside the VFD render pipeline.
 *
 * Two glyphs map to a fully blank pixel column band: an ASCII space and this
 * non-breaking space. The non-breaking variant exists so layout code can mark
 * intentionally empty cells without having a surrounding string get trimmed
 * by upstream content normalization.
 */
export const EMPTY_CELL = "\u00A0";

/**
 * Pixel pattern for an empty 5x7 glyph cell.
 *
 * Used as the rendered output when a glyph has no displayable pattern, when a
 * section is padded out to a fixed cell count, or when the caller passes
 * whitespace into the matrix.
 */
export const BLANK_GLYPH = ["00000", "00000", "00000", "00000", "00000", "00000", "00000"] as const;

/**
 * Pixel pattern for a fully lit 5x7 glyph cell.
 *
 * Used by the ghost/inactive overlay and by spectrum level 7 so the canvas
 * keeps a stable visual reference for "all pixels on" instead of synthesizing
 * the pattern at render time.
 */
export const FULL_GLYPH = ["11111", "11111", "11111", "11111", "11111", "11111", "11111"] as const;
