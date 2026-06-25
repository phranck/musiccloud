import { describe, expect, it } from "vitest";
import { glyphPatternKeyFor, isVfdGlyphSupported } from "@/components/ui/VfdGlyphPatterns";

describe("VfdDisplay glyph support", () => {
  it("supports Cyrillic uppercase and lowercase letters for song info text", () => {
    const russianUppercase = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ";
    const russianLowercase = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
    const additionalCyrillic = "ЄєІіЇїҐґЎўЈјЉљЊњЋћЏџЅѕ";
    const sampleSongInfo = "Жанна Фриске - Ёлка / Київ";

    for (const glyph of Array.from(`${russianUppercase}${russianLowercase}${additionalCyrillic}${sampleSongInfo}`)) {
      expect(isVfdGlyphSupported(glyph), `expected ${glyph} to have a VFD glyph`).toBe(true);
    }
  });

  it("renders Slovene/Gaj caron letters with their own glyph instead of stripping the háček", () => {
    // Real-world trigger: Jamendo artist "Maya Filipič" rendered as "Maya FilipiC"
    // because Č/Š/Ž decomposed via NFD and the combining caron was stripped down
    // to the bare base letter. Each caron letter must resolve to its own pattern
    // key, not to the accent-less Latin base.
    const caronUppercase = "ČŠŽ";
    const caronLowercase = "čšž";

    for (const glyph of Array.from(`${caronUppercase}${caronLowercase}`)) {
      expect(glyphPatternKeyFor(glyph), `expected ${glyph} to resolve to its own glyph`).toBe(glyph);
      expect(isVfdGlyphSupported(glyph), `expected ${glyph} to have a VFD glyph`).toBe(true);
    }
  });

  it("keeps unknown glyphs on the fallback path", () => {
    expect(isVfdGlyphSupported("🪩")).toBe(false);
  });
});
