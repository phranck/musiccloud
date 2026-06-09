import { BLANK_GLYPH } from "./blanks";
import { CONTROL_GLYPHS } from "./control";
import { CYRILLIC_GLYPHS } from "./cyrillic";
import { LATIN_GLYPHS } from "./latin";
import { SYMBOL_GLYPHS } from "./symbols";

export { BLANK_GLYPH, EMPTY_CELL, FULL_GLYPH } from "./blanks";
export { CONTROL_GLYPHS, SPECTRUM_GLYPH_LEVELS } from "./control";
export { CYRILLIC_GLYPHS } from "./cyrillic";
export { LATIN_GLYPHS } from "./latin";
export { SYMBOL_GLYPHS } from "./symbols";

/**
 * Combined glyph-to-pixel-pattern lookup used by the VFD render pipeline.
 *
 * Built by merging the thematic pattern subsets in a fixed order: symbols
 * first, then Latin, then Cyrillic, then the private-use control glyphs.
 * No two subsets currently share a key, so the order only matters as a
 * deterministic tie-breaker in case a future subset adds a colliding entry.
 */
export const VFD_GLYPH_PATTERNS: Record<string, readonly string[]> = {
  ...SYMBOL_GLYPHS,
  ...LATIN_GLYPHS,
  ...CYRILLIC_GLYPHS,
  ...CONTROL_GLYPHS,
};

/**
 * Resolves a user-supplied glyph string to the key that {@link VFD_GLYPH_PATTERNS}
 * actually stores its pattern under, or to a fallback key when no direct match
 * exists.
 *
 * The resolution order is:
 *
 * 1. Exact key match (e.g. `"A"`, `"♪"`, a Cyrillic letter).
 * 2. Uppercase normalization, so lowercase Latin letters that lack a dedicated
 *    pattern can reuse the uppercase form. Cyrillic and German lowercase
 *    letters have their own patterns and short-circuit at step 1.
 * 3. NFD decomposition with combining marks stripped, used to map accented
 *    letters back to their base letter (e.g. `"Ñ"` → `"N"`).
 * 4. The `"?"` fallback key when nothing else resolves and the question-mark
 *    pattern itself is registered.
 *
 * Returns `null` only when no key matches and `"?"` is not registered, which
 * lets callers distinguish "unrenderable" from "falls back to question mark".
 *
 * @param glyph Single user-facing grapheme, as already split by `Array.from`.
 * @returns The lookup key into {@link VFD_GLYPH_PATTERNS}, or `null` if no key applies.
 */
export function glyphPatternKeyFor(glyph: string): string | null {
  if (VFD_GLYPH_PATTERNS[glyph]) return glyph;
  const normalizedGlyph = glyph.toLocaleUpperCase("en-US");
  const baseGlyph = normalizedGlyph.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (VFD_GLYPH_PATTERNS[normalizedGlyph]) return normalizedGlyph;
  if (VFD_GLYPH_PATTERNS[baseGlyph]) return baseGlyph;
  return VFD_GLYPH_PATTERNS["?"] ? "?" : null;
}

/**
 * Returns the 5x7 pixel pattern for a single glyph, falling back to
 * {@link BLANK_GLYPH} when the glyph has no resolvable key.
 *
 * Used by the canvas renderer in `VfdDisplay` to translate every character of
 * a section's content into the column masks that drive `fillRect`. The
 * blank-pattern fallback exists so an unresolvable glyph still occupies one
 * cell of empty space, keeping section widths stable.
 *
 * @param glyph Single user-facing grapheme.
 * @returns Row-major 5x7 bitmask as 7 strings of 5 chars each.
 */
export function glyphPatternFor(glyph: string): readonly string[] {
  const key = glyphPatternKeyFor(glyph);
  return key ? (VFD_GLYPH_PATTERNS[key] ?? BLANK_GLYPH) : BLANK_GLYPH;
}

/**
 * Reports whether a glyph is genuinely supported by the VFD font.
 *
 * A glyph counts as supported when it resolves to a pattern key other than
 * the `"?"` fallback. The literal `"?"` is treated as supported because it
 * is itself a real pattern in the font; only the *fallback to* `"?"` from an
 * unknown glyph is considered unsupported.
 *
 * Consumers use this signal to decide whether to display a string on the VFD
 * directly or to substitute a representable approximation.
 *
 * @param glyph Single user-facing grapheme.
 * @returns `true` when the glyph has a dedicated or normalized pattern, `false` when it would fall back to `"?"` or to nothing at all.
 */
export function isVfdGlyphSupported(glyph: string): boolean {
  if (glyph === "?") return true;
  const key = glyphPatternKeyFor(glyph);
  return key !== null && key !== "?";
}
