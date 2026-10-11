import { CYRILLIC_GLYPHS } from "./cyrillic";
import { LATIN_GLYPHS } from "./latin";

/**
 * Pixel patterns for the Greek glyph range supported by the VFD module.
 *
 * Covers the full alphabet in both cases, the final sigma, and the monotonic
 * lowercase letters with tonos or dialytika, whose mark stays visible in the
 * two rows above the x-height as it does for the Latin acute and diaeresis.
 * Polytonic letters and uppercase letters with tonos have no pattern here:
 * the lookup in `index.ts` strips their marks and draws the base letter in the
 * same case.
 *
 * A Greek letter that looks exactly like a Latin or Cyrillic one shares that
 * letter's pattern, so the homoglyphs cannot drift apart. Each other value is
 * a row-major 5x7 bitmask using "1" for lit and "0" for unlit pixels.
 */
export const GREEK_GLYPHS: Record<string, readonly string[]> = {
  Α: LATIN_GLYPHS.A,
  Β: LATIN_GLYPHS.B,
  Γ: CYRILLIC_GLYPHS.Г,
  Δ: ["00100", "00100", "01010", "01010", "10001", "10001", "11111"],
  Ε: LATIN_GLYPHS.E,
  Ζ: LATIN_GLYPHS.Z,
  Η: LATIN_GLYPHS.H,
  Θ: ["01110", "10001", "10001", "11111", "10001", "10001", "01110"],
  Ι: LATIN_GLYPHS.I,
  Κ: LATIN_GLYPHS.K,
  Λ: ["00100", "00100", "01010", "01010", "10001", "10001", "10001"],
  Μ: LATIN_GLYPHS.M,
  Ν: LATIN_GLYPHS.N,
  Ξ: ["11111", "00000", "00000", "01110", "00000", "00000", "11111"],
  Ο: LATIN_GLYPHS.O,
  Π: CYRILLIC_GLYPHS.П,
  Ρ: LATIN_GLYPHS.P,
  Σ: ["11111", "10000", "01000", "00100", "01000", "10000", "11111"],
  Τ: LATIN_GLYPHS.T,
  Υ: LATIN_GLYPHS.Y,
  Φ: CYRILLIC_GLYPHS.Ф,
  Χ: LATIN_GLYPHS.X,
  Ψ: ["10101", "10101", "10101", "01110", "00100", "00100", "00100"],
  Ω: ["01110", "10001", "10001", "10001", "01010", "01010", "11011"],
  α: ["00000", "00000", "01101", "10010", "10010", "10010", "01101"],
  β: ["01110", "10001", "10001", "11110", "10001", "11110", "10000"],
  γ: ["00000", "00000", "10001", "10001", "01010", "00100", "00100"],
  δ: ["01110", "10000", "01000", "01110", "10001", "10001", "01110"],
  ε: ["00000", "00000", "01111", "10000", "01110", "10000", "01111"],
  ζ: ["11111", "00010", "00100", "01000", "10000", "01110", "00001"],
  η: ["00000", "00000", "10110", "11001", "10001", "10001", "00001"],
  θ: ["00100", "01010", "10001", "11111", "10001", "01010", "00100"],
  ι: ["00000", "00000", "00100", "00100", "00100", "00100", "00011"],
  κ: CYRILLIC_GLYPHS.к,
  λ: ["01000", "00100", "00100", "01010", "01010", "10001", "10001"],
  μ: ["00000", "00000", "10001", "10001", "10011", "11101", "10000"],
  ν: ["00000", "00000", "10001", "10001", "10010", "10100", "11000"],
  ξ: ["01110", "10000", "01100", "10000", "01110", "00001", "00110"],
  ο: LATIN_GLYPHS.o,
  π: ["00000", "00000", "11111", "01010", "01010", "01010", "01010"],
  ρ: ["00000", "00000", "01110", "10001", "10001", "11110", "10000"],
  σ: ["00000", "00000", "01111", "10010", "10001", "10001", "01110"],
  ς: ["00000", "00000", "01111", "10000", "10000", "01110", "00011"],
  τ: ["00000", "00000", "11111", "00100", "00100", "00100", "00010"],
  υ: ["00000", "00000", "10001", "10001", "10001", "10001", "01110"],
  φ: CYRILLIC_GLYPHS.ф,
  χ: LATIN_GLYPHS.x,
  ψ: ["00000", "00000", "10101", "10101", "10101", "01110", "00100"],
  ω: ["00000", "00000", "01010", "10001", "10101", "10101", "01010"],
  // Tonos, drawn like the Latin acute in rows 0-1
  ά: ["00010", "00100", "01101", "10010", "10010", "10010", "01101"],
  έ: ["00010", "00100", "01111", "10000", "01110", "10000", "01111"],
  ή: ["00010", "00100", "10110", "11001", "10001", "10001", "00001"],
  // Without a blank row and with iota's hook, the mark and the stroke read as
  // a bracket, so this iota is a plain stroke below a gap.
  ί: ["00010", "00100", "00000", "00100", "00100", "00100", "00100"],
  ό: LATIN_GLYPHS.ó,
  ύ: ["00010", "00100", "10001", "10001", "10001", "10001", "01110"],
  ώ: ["00010", "00100", "01010", "10001", "10101", "10101", "01010"],
  // Dialytika, drawn like the Latin diaeresis
  ϊ: ["01010", "00000", "00100", "00100", "00100", "00100", "00011"],
  ϋ: ["01010", "00000", "10001", "10001", "10001", "10001", "01110"],
  Ϊ: LATIN_GLYPHS.Ï,
  Ϋ: LATIN_GLYPHS.Ÿ,
};
