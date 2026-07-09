import { describe, expect, it } from "vitest";
import { recordSwapKey } from "@/components/cards/recordSwapKey";

/** Minimal swap-key input used across the cases. */
type Input = {
  artist: string;
  title: string;
  album?: string;
  labelAlbumTitle?: string;
  artworkUrl: string;
  shortId?: string;
  previewUrl?: string;
};

const albumTrack: Input = {
  artist: "Miles Davis",
  title: "So What",
  album: "Kind of Blue",
  artworkUrl: "https://cdn.example/kob.jpg",
  shortId: "aaa",
  previewUrl: "https://cdn.example/so-what.mp3",
};

describe("recordSwapKey", () => {
  it("is stable across tracks of the same album (so the record does not swap)", () => {
    const trackTwo: Input = {
      ...albumTrack,
      title: "Freddie Freeloader",
      shortId: "bbb",
      previewUrl: "https://cdn.example/freddie.mp3",
    };
    expect(recordSwapKey(albumTrack)).toBe(recordSwapKey(trackTwo));
  });

  it("differs between different albums (so the record swaps)", () => {
    const otherAlbum: Input = { ...albumTrack, album: "Bitches Brew", title: "Spanish Key" };
    expect(recordSwapKey(albumTrack)).not.toBe(recordSwapKey(otherAlbum));
  });

  it("is track-unique when the entity carries no album (single/artist)", () => {
    const singleOne: Input = {
      artist: "Aphex Twin",
      title: "Avril 14th",
      artworkUrl: "https://cdn.example/avril.jpg",
      shortId: "s1",
      previewUrl: "https://cdn.example/avril.mp3",
    };
    const singleTwo: Input = {
      artist: "Aphex Twin",
      title: "Xtal",
      artworkUrl: "https://cdn.example/xtal.jpg",
      shortId: "s2",
      previewUrl: "https://cdn.example/xtal.mp3",
    };
    expect(recordSwapKey(singleOne)).not.toBe(recordSwapKey(singleTwo));
  });
});
