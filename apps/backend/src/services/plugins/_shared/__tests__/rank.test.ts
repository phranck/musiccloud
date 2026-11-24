import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "../../../../lib/infra/logger.js";
import { MATCH_MIN_CONFIDENCE } from "../../../constants.js";
import type { NormalizedAlbum, NormalizedArtist, NormalizedTrack } from "../../../types.js";
import {
  logCandidateScore,
  pickBestCandidate,
  pickBestTrack,
  rankByArtistName,
  searchMatchResult,
  trackScoreLogger,
  usableTracks,
} from "../rank.js";

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

  it("reports every hit to onScored with its position and score, in order", () => {
    const scored: Array<[string, number, number]> = [];
    const scores = new Map([
      ["a", 0.4],
      ["b", 0.8],
      ["c", 0.8],
    ]);
    const result = pickBestCandidate(
      scores.keys(),
      (name) => scores.get(name) ?? 0,
      (name, index, confidence) => scored.push([name, index, confidence]),
    );
    expect(scored).toEqual([
      ["a", 0, 0.4],
      ["b", 1, 0.8],
      ["c", 2, 0.8],
    ]);
    expect(result).toEqual({ best: "b", confidence: 0.8 });
  });
});

describe("usableTracks", () => {
  it("drops unusable hits without shifting the positions after them", () => {
    const raw = [{ id: "a" }, { id: "" }, { id: "c" }];
    const hits = usableTracks(
      raw,
      (item) => item.id !== "",
      (item) => ({ ...track, sourceId: item.id }),
    );
    expect(hits.map((hit) => [hit.track.sourceId, hit.index])).toEqual([
      ["a", 0],
      ["c", 2],
    ]);
  });
});

describe("pickBestTrack", () => {
  it("scores and logs each track with its original position and returns the track", () => {
    const logged: Array<[string, number, number]> = [];
    const hits = [
      { track: { ...track, sourceId: "a" }, index: 1 },
      { track: { ...track, sourceId: "b" }, index: 3 },
    ];
    const result = pickBestTrack(
      hits,
      (_track, index) => index / 10,
      (scoredTrack, index, confidence) => logged.push([scoredTrack.sourceId, index, confidence]),
    );
    expect(logged).toEqual([
      ["a", 1, 0.1],
      ["b", 3, 0.3],
    ]);
    expect(result).toEqual({ best: hits[1].track, confidence: 0.3 });
  });

  it("reports no track for an empty list", () => {
    const ignoreScore = () => {};
    expect(pickBestTrack([], () => 1, ignoreScore)).toEqual({ best: null, confidence: 0 });
  });
});

describe("score debug lines", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prints a track with its position, artists and score", () => {
    const debug = vi.spyOn(log, "debug").mockImplementation(() => {});
    trackScoreLogger("Bandcamp")({ ...track, artists: ["A", "B"] }, 2, 0.87549);
    expect(debug).toHaveBeenCalledWith("Bandcamp", '  [2] "Song" by A, B -> confidence=0.875');
  });

  it("prints the arrow the adapter names", () => {
    const debug = vi.spyOn(log, "debug").mockImplementation(() => {});
    trackScoreLogger("Napster", "→")(track, 0, 1);
    logCandidateScore("Napster", 'Artist "Artist"', 0.5, "→");
    expect(debug.mock.calls).toEqual([
      ["Napster", '  [0] "Song" by Artist → confidence=1.000'],
      ["Napster", '  Artist "Artist" → confidence=0.500'],
    ]);
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
