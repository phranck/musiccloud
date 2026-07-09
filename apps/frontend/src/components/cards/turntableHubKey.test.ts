import { describe, expect, it } from "vitest";
import { turntableHubKey } from "@/components/cards/turntableHubKey";

/** Minimal hub-key input used across the cases. */
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

describe("turntableHubKey", () => {
  it("is stable across tracks of the same album (so the hub does not remount)", () => {
    const trackTwo: Input = {
      ...albumTrack,
      title: "Freddie Freeloader",
      shortId: "bbb",
      previewUrl: "https://cdn.example/freddie.mp3",
    };
    expect(turntableHubKey(albumTrack)).toBe(turntableHubKey(trackTwo));
  });

  it("differs between different albums (so the hub remounts)", () => {
    const otherAlbum: Input = { ...albumTrack, album: "Bitches Brew", title: "Spanish Key" };
    expect(turntableHubKey(albumTrack)).not.toBe(turntableHubKey(otherAlbum));
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
    expect(turntableHubKey(singleOne)).not.toBe(turntableHubKey(singleTwo));
  });
});
