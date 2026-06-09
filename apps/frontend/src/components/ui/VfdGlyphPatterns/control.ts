import { VfdGlyph } from "@/components/ui/VfdGlyphs";
import { BLANK_GLYPH, FULL_GLYPH } from "./blanks";

/**
 * Pixel patterns for the private-use VFD control glyphs.
 *
 * These are not real text characters; they are dedicated codepoints in the
 * Unicode private-use area used by `VfdDisplay` to render hardware-style UI
 * affordances directly inside the dot-matrix grid (the ghost overlay, the
 * progress-bar fill and end caps, the spectrum analyzer cap levels). Callers
 * reference them through the {@link VfdGlyph} namespace, never as literal
 * code units.
 */
export const CONTROL_GLYPHS: Record<string, readonly string[]> = {
  [VfdGlyph.Ghost]: FULL_GLYPH,
  [VfdGlyph.ProgressEmpty]: BLANK_GLYPH,
  [VfdGlyph.ProgressBlock1]: ["00000", "10000", "10000", "10000", "10000", "10000", "00000"],
  [VfdGlyph.ProgressBlock2]: ["00000", "11000", "11000", "11000", "11000", "11000", "00000"],
  [VfdGlyph.ProgressBlock3]: ["00000", "11100", "11100", "11100", "11100", "11100", "00000"],
  [VfdGlyph.ProgressBlock4]: ["00000", "11110", "11110", "11110", "11110", "11110", "00000"],
  [VfdGlyph.ProgressBlock]: ["00000", "11111", "11111", "11111", "11111", "11111", "00000"],
  [VfdGlyph.ProgressRailEmpty]: ["00000", "00000", "00000", "00000", "00000", "11111", "11111"],
  [VfdGlyph.ProgressMarker]: ["01100", "01100", "01100", "01100", "01100", "11100", "11100"],
  [VfdGlyph.ProgressMarkerStart]: ["11000", "11000", "11000", "11000", "11000", "11000", "11000"],
  [VfdGlyph.ProgressMarkerRight]: ["00110", "00110", "00110", "00110", "00110", "11110", "11110"],
  [VfdGlyph.ProgressMarkerEnd2]: ["00011", "00011", "00011", "00011", "00011", "11111", "11111"],
  [VfdGlyph.ProgressMarkerEnd1]: ["00001", "00001", "00001", "00001", "00001", "11111", "11111"],
  [VfdGlyph.ProgressMarkerNext1]: ["10000", "10000", "10000", "10000", "10000", "10000", "10000"],
  [VfdGlyph.ProgressMarkerNext2]: ["11000", "11000", "11000", "11000", "11000", "11000", "11000"],
  [VfdGlyph.SpectrumLevel0]: BLANK_GLYPH,
  [VfdGlyph.SpectrumLevel1]: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  [VfdGlyph.SpectrumLevel2]: ["00000", "00000", "00000", "00000", "00000", "11111", "11111"],
  [VfdGlyph.SpectrumLevel3]: ["00000", "00000", "00000", "00000", "11111", "11111", "11111"],
  [VfdGlyph.SpectrumLevel4]: ["00000", "00000", "00000", "11111", "11111", "11111", "11111"],
  [VfdGlyph.SpectrumLevel5]: ["00000", "00000", "11111", "11111", "11111", "11111", "11111"],
  [VfdGlyph.SpectrumLevel6]: ["00000", "11111", "11111", "11111", "11111", "11111", "11111"],
  [VfdGlyph.SpectrumLevel7]: FULL_GLYPH,
};

/**
 * Numeric level of each spectrum-analyzer glyph, 0 (silent) to 7 (peak).
 *
 * `VfdDisplay` reads this map during the canvas pass to highlight the leading
 * "cap" pixel of a spectrum column when the section is rendered at `bright`
 * intensity. Glyphs not present in the map render as plain patterns without
 * the spectrum cap treatment.
 */
export const SPECTRUM_GLYPH_LEVELS: Record<string, number> = {
  [VfdGlyph.SpectrumLevel0]: 0,
  [VfdGlyph.SpectrumLevel1]: 1,
  [VfdGlyph.SpectrumLevel2]: 2,
  [VfdGlyph.SpectrumLevel3]: 3,
  [VfdGlyph.SpectrumLevel4]: 4,
  [VfdGlyph.SpectrumLevel5]: 5,
  [VfdGlyph.SpectrumLevel6]: 6,
  [VfdGlyph.SpectrumLevel7]: 7,
};
