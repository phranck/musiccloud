import { describe, expect, it } from "vitest";
import { sameAlbum } from "@/lib/resolve/album-identity";

/** Minimal album-identity input used across the cases. */
type Input = {
  artist: string;
  album?: string;
  labelAlbumTitle?: string;
  artworkUrl: string;
};

const base: Input = {
  artist: "Miles Davis",
  album: "Kind of Blue",
  artworkUrl: "https://cdn.example/kob.jpg",
};

describe("sameAlbum", () => {
  it("is true for the same artist and album title", () => {
    const a: Input = { ...base };
    const b: Input = { ...base, artworkUrl: "https://cdn.example/kob-2.jpg" };
    expect(sameAlbum(a, b)).toBe(true);
  });

  it("is false for the same artist but a different album (and different artwork)", () => {
    const a: Input = { ...base };
    const b: Input = { ...base, album: "Bitches Brew", artworkUrl: "https://cdn.example/bb.jpg" };
    expect(sameAlbum(a, b)).toBe(false);
  });

  it("is true when the album titles differ but the artwork is identical (positive signal)", () => {
    const a: Input = { ...base, album: "Kind of Blue" };
    const b: Input = { ...base, album: "Kind of Blue (Remastered)" };
    // same artist, both albums present, identical artwork -> treated as the same album
    expect(sameAlbum(a, b)).toBe(true);
  });

  it("is false when the album is missing on one side, even if artist and artwork match", () => {
    const a: Input = { ...base };
    const b: Input = { artist: base.artist, artworkUrl: base.artworkUrl };
    expect(sameAlbum(a, b)).toBe(false);
    expect(sameAlbum(b, a)).toBe(false);
  });

  it("is false for a different artist with the same album title", () => {
    const a: Input = { ...base };
    const b: Input = { ...base, artist: "John Coltrane" };
    expect(sameAlbum(a, b)).toBe(false);
  });

  it("prefers labelAlbumTitle over album when comparing", () => {
    const a: Input = { artist: base.artist, labelAlbumTitle: "Kind of Blue", artworkUrl: base.artworkUrl };
    const b: Input = { artist: base.artist, album: "Kind of Blue", artworkUrl: "https://cdn.example/other.jpg" };
    expect(sameAlbum(a, b)).toBe(true);
  });

  it("normalizes case and surrounding whitespace on artist and album", () => {
    const a: Input = { ...base, artist: "Miles Davis", album: "Kind of Blue" };
    const b: Input = { ...base, artist: "  miles davis ", album: "KIND OF BLUE", artworkUrl: "x" };
    expect(sameAlbum(a, b)).toBe(true);
  });
});
