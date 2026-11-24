import { describe, expect, it } from "vitest";
import { MATCH_MIN_CONFIDENCE } from "../../../constants.js";
import type { NormalizedAlbum, NormalizedArtist, NormalizedTrack } from "../../../types.js";
import { pickBestCandidate, rankByArtistName, searchMatchResult } from "../rank.js";

/** A track fixture; only its identity matters to the result shape. */
const track: NormalizedTrack = {
  sourceService: "deezer",
  sourceId: "track-1",
  title: "Song",
  artists: ["Artist"],
  webUrl: "https://example.test/track-1",
};

/** An album fixture; only its identity matters to the result shape. */
const album: NormalizedAlbum = {
  sourceService: "deezer",
  sourceId: "album-1",
  title: "Album",
  artists: ["Artist"],
  webUrl: "https://example.test/album-1",
};

/** An artist fixture; only its identity matters to the result shape. */
const artist: NormalizedArtist = {
  sourceService: "deezer",
  sourceId: "artist-1",
  name: "Artist",
  webUrl: "https://example.test/artist-1",
};

/** A custom threshold below the default, to prove the parameter is honored. */
const LOWER_THRESHOLD = 0.3;

describe("pickBestCandidate", () => {
  it("keeps the hit with the highest score", () => {
    const scores = new Map([
      ["low", 0.2],
      ["high", 0.9],
      ["mid", 0.5],
    ]);
    expect(pickBestCandidate(scores.keys(), (name) => scores.get(name) ?? 0)).toEqual({
      best: "high",
      confidence: 0.9,
    });
  });

  it("keeps the earliest hit on a tie", () => {
    const hits = [
      { id: "first", score: 0.7 },
      { id: "second", score: 0.7 },
    ];
    expect(pickBestCandidate(hits, (hit) => hit.score).best?.id).toBe("first");
  });

  it("passes each hit its position", () => {
    const seen: number[] = [];
    pickBestCandidate(["a", "b", "c"], (_hit, index) => {
      seen.push(index);
      return index;
    });
    expect(seen).toEqual([0, 1, 2]);
  });

  it("keeps the first hit when every hit scores zero", () => {
    expect(pickBestCandidate(["first", "second"], () => 0)).toEqual({ best: "first", confidence: 0 });
  });

  it("reports no hit and zero confidence for an empty list", () => {
    expect(pickBestCandidate([], () => 1)).toEqual({ best: null, confidence: 0 });
  });
});

describe("searchMatchResult", () => {
  it("reports a hit exactly at the threshold as found", () => {
    expect(searchMatchResult("track", track, MATCH_MIN_CONFIDENCE)).toEqual({
      found: true,
      track,
      confidence: MATCH_MIN_CONFIDENCE,
      matchMethod: "search",
    });
  });

  it("reports a hit below the threshold as a miss with its confidence", () => {
    expect(searchMatchResult("album", album, MATCH_MIN_CONFIDENCE - 0.01)).toEqual({
      found: false,
      confidence: MATCH_MIN_CONFIDENCE - 0.01,
      matchMethod: "search",
    });
  });

  it("reports a miss when there is no hit", () => {
    expect(searchMatchResult("artist", null, 0)).toEqual({ found: false, confidence: 0, matchMethod: "search" });
  });

  it("returns the entity in the field its kind names", () => {
    expect(searchMatchResult("album", album, 1)).toEqual({
      found: true,
      album,
      confidence: 1,
      matchMethod: "search",
    });
    expect(searchMatchResult("artist", artist, 1)).toEqual({
      found: true,
      artist,
      confidence: 1,
      matchMethod: "search",
    });
  });

  it("honors a threshold the caller names", () => {
    expect(searchMatchResult("track", track, LOWER_THRESHOLD, LOWER_THRESHOLD).found).toBe(true);
  });
});

describe("rankByArtistName", () => {
  it("picks the hit whose name matches the searched name", () => {
    const hits = [{ name: "FON" }, { name: "Fön" }];
    expect(rankByArtistName("Fön", hits, (hit) => hit.name)?.item.name).toBe("Fön");
  });

  it("returns the first hit even when no name matches at all", () => {
    const hits = [{ name: "xyz" }, { name: "qrs" }];
    expect(rankByArtistName("Fön", hits, (hit) => hit.name)).toEqual({ item: hits[0], confidence: 0 });
  });

  it("returns null for an empty list", () => {
    expect(rankByArtistName("Fön", [], (hit: { name: string }) => hit.name)).toBeNull();
  });
});
