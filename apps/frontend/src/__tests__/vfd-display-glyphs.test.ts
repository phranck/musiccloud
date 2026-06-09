import { describe, expect, it } from "vitest";
import { isVfdGlyphSupported } from "@/components/ui/VfdGlyphPatterns";

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

  it("keeps unknown glyphs on the fallback path", () => {
    expect(isVfdGlyphSupported("🪩")).toBe(false);
  });
});
