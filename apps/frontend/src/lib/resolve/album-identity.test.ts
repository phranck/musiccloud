import { describe, expect, it } from "vitest";
import { albumIdentityKey, sameAlbum } from "@/lib/resolve/album-identity";

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

describe("albumIdentityKey", () => {
  it("is stable across tracks of the same album (different artwork does not change it)", () => {
    const a: Input = { ...base };
    const b: Input = { ...base, artworkUrl: "https://cdn.example/kob-track2.jpg" };
    expect(albumIdentityKey(a)).toBe(albumIdentityKey(b));
    expect(albumIdentityKey(a)).not.toBeNull();
  });

  it("differs between different albums of the same artist", () => {
    const a: Input = { ...base };
    const b: Input = { ...base, album: "Bitches Brew" };
    expect(albumIdentityKey(a)).not.toBe(albumIdentityKey(b));
  });

  it("is null when the entity carries no album (single or artist)", () => {
    const single: Input = { artist: base.artist, artworkUrl: base.artworkUrl };
    expect(albumIdentityKey(single)).toBeNull();
  });

  it("prefers labelAlbumTitle over album", () => {
    const a: Input = { artist: base.artist, labelAlbumTitle: "Kind of Blue", artworkUrl: "x" };
    const b: Input = { artist: base.artist, album: "Kind of Blue", artworkUrl: "y" };
    expect(albumIdentityKey(a)).toBe(albumIdentityKey(b));
  });

  it("normalizes case and surrounding whitespace", () => {
    const a: Input = { ...base, artist: "Miles Davis", album: "Kind of Blue" };
    const b: Input = { ...base, artist: "  miles davis ", album: "KIND OF BLUE" };
    expect(albumIdentityKey(a)).toBe(albumIdentityKey(b));
  });
});

describe("sameAlbum", () => {
  it("is true for the same artist and album title", () => {
    const a: Input = { ...base };
    const b: Input = { ...base, artworkUrl: "https://cdn.example/kob-2.jpg" };
    expect(sameAlbum(a, b)).toBe(true);
  });

  it("is false for the same artist but a different album", () => {
    const a: Input = { ...base };
    const b: Input = { ...base, album: "Bitches Brew" };
    expect(sameAlbum(a, b)).toBe(false);
  });

  it("is false when album titles differ, even if the artwork is identical", () => {
    const a: Input = { ...base, album: "Kind of Blue" };
    const b: Input = { ...base, album: "Kind of Blue (Remastered)" };
    // identity is artist + album title; artwork alone must not merge two albums
    expect(sameAlbum(a, b)).toBe(false);
  });

  it("is false when the album is missing on one side (singles are standalone)", () => {
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
