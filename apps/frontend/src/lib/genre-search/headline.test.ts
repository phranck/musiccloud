import { describe, expect, it } from "vitest";
import { buildHeadline, type QueryDetails } from "@/lib/genre-search/headline";

/** Convenience builder so each case only spells out the fields it varies. */
function query(partial: Partial<QueryDetails>): QueryDetails {
  return { genres: ["jazz"], vibe: "hot", tracks: null, albums: null, artists: null, ...partial };
}

describe("buildHeadline", () => {
  it("renders the hot vibe as 'N tracks in <genre>'", () => {
    expect(buildHeadline(query({ vibe: "hot", tracks: 10 }))).toBe("10 tracks in jazz");
  });

  it("renders the mixed vibe with the trailing 'mixed selection' clause", () => {
    expect(buildHeadline(query({ vibe: "mixed", tracks: 20, albums: 10, genres: ["jazz", "rock"] }))).toBe(
      "20 tracks and 10 albums in jazz or rock — a mixed selection",
    );
  });

  it("collapses equal per-type counts to the all-types phrase", () => {
    expect(buildHeadline(query({ tracks: 5, albums: 5, artists: 5 }))).toBe("5 tracks, albums and artists in jazz");
  });

  it("normalizes genre names to lowercase English running text", () => {
    expect(buildHeadline(query({ tracks: 3, genres: ["Jazz"] }))).toBe("3 tracks in jazz");
  });
});
