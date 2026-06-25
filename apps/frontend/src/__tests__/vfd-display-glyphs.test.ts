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

  it("renders European Latin diacritic and special letters with their own glyph", () => {
    // Each diacritic letter must keep its own pattern so the accent stays
    // visible on the matrix instead of being stripped to the bare base letter
    // by the NFD fallback. Grouped by mark family across Western, Central,
    // Northern and Eastern European orthographies.
    const byFamily = {
      acute: "ÁÉÍÓÚÝĆĹŃŔŚŹáéíóúýćĺńŕśź",
      grave: "ÀÈÌÒÙàèìòù",
      circumflex: "ÂÊÎÔÛâêîôû",
      diaeresis: "ÄËÏÖÜŸäëïöüÿ",
      tilde: "ÃÑÕãñõ",
      caron: "ČĎĚĽŇŘŠŤŽčďěľňřšťž",
      ring: "ÅŮåů",
      breve: "ĂĞăğ",
      macron: "ĀĒĪŪāēīū",
      doubleAcute: "ŐŰőű",
      dotAbove: "ĖİŻėż",
      cedilla: "ÇĢĶĻŅŞçģķļņş",
      ogonek: "ĄĘĮŲąęįų",
      commaBelow: "ȘȚșț",
      specialLetters: "ÐĐŁÞŒðđłþœı",
    };

    for (const glyphs of Object.values(byFamily)) {
      for (const glyph of Array.from(glyphs)) {
        expect(glyphPatternKeyFor(glyph), `expected ${glyph} to resolve to its own glyph`).toBe(glyph);
        expect(isVfdGlyphSupported(glyph), `expected ${glyph} to be supported`).toBe(true);
      }
    }
  });

  it("supports the inverted Spanish punctuation marks", () => {
    for (const glyph of Array.from("¿¡")) {
      expect(glyphPatternKeyFor(glyph), `expected ${glyph} to resolve to its own glyph`).toBe(glyph);
    }
  });

  it("renders real-world accented artist names without losing a diacritic", () => {
    const names = "Antonín Dvořák Mylène Sigur Rós Björk Renée Motörhead Lech Wałęsa François Beyoncé";
    for (const glyph of Array.from(names)) {
      if (glyph === " ") continue;
      expect(isVfdGlyphSupported(glyph), `expected ${glyph} to be supported`).toBe(true);
    }
  });

  it("keeps unknown glyphs on the fallback path", () => {
    expect(isVfdGlyphSupported("🪩")).toBe(false);
  });
});
