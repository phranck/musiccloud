import { describe, expect, it } from "vitest";

import { mergeArtistPartials } from "../../services/artist-composition/merge.js";
import { ARTIST_MERGE_STRATEGY } from "../../services/artist-composition/strategy.js";
import type { ArtistPartial } from "../../services/artist-composition/types.js";

const NAME = "Radiohead";

describe("mergeArtistPartials", () => {
  it("respects per-field source priority (Deezer wins imageUrl)", () => {
    const partials: ArtistPartial[] = [
      { __source: "spotify", imageUrl: "https://spotify/a.jpg" },
      { __source: "deezer", imageUrl: "https://deezer/b.jpg" },
    ];
    const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, NAME);
    expect(merged.imageUrl).toBe("https://deezer/b.jpg");
  });

  it("falls back to lower-priority source when higher is missing", () => {
    const partials: ArtistPartial[] = [{ __source: "spotify", imageUrl: "https://spotify/a.jpg" }];
    const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, NAME);
    expect(merged.imageUrl).toBe("https://spotify/a.jpg");
  });

  it("returns null when no source provides the field", () => {
    const partials: ArtistPartial[] = [{ __source: "lastfm", popularity: 12345 }];
    const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, NAME);
    expect(merged.imageUrl).toBeNull();
    expect(merged.followers).toBeNull();
  });

  it("returns empty array for missing array-typed fields", () => {
    const merged = mergeArtistPartials([], ARTIST_MERGE_STRATEGY, NAME);
    expect(merged.genres).toEqual([]);
    expect(merged.similarArtists).toEqual([]);
    expect(merged.topTracks).toEqual([]);
  });

  it("filters out null entries from input partials", () => {
    const partials = [null, { __source: "deezer" as const, imageUrl: "https://deezer/x.jpg" }, null];
    const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, NAME);
    expect(merged.imageUrl).toBe("https://deezer/x.jpg");
  });

  it("treats empty arrays as missing and falls through to next source", () => {
    const partials: ArtistPartial[] = [
      { __source: "spotify", genres: [] },
      { __source: "lastfm", genres: ["alt-rock"] },
    ];
    const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, NAME);
    expect(merged.genres).toEqual(["alt-rock"]);
  });

  it("treats explicit null values as missing and falls through", () => {
    const partials: ArtistPartial[] = [
      { __source: "deezer", followers: null },
      { __source: "lastfm", followers: 500 },
    ];
    const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, NAME);
    expect(merged.followers).toBe(500);
  });

  it("keeps name from caller, ignoring source partials", () => {
    const partials: ArtistPartial[] = [{ __source: "spotify", imageUrl: "https://x" }];
    const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, NAME);
    expect(merged.name).toBe(NAME);
  });

  it("with all sources present, returns fully populated CanonicalArtist", () => {
    const partials: ArtistPartial[] = [
      {
        __source: "spotify",
        imageUrl: "https://spotify/img",
        genres: ["alt-rock"],
      },
      {
        __source: "deezer",
        imageUrl: "https://deezer/img",
        followers: 2_000_000,
        topTracks: [],
      },
      {
        __source: "lastfm",
        popularity: 1_500_000,
        scrobbles: 500_000_000,
        bioSummary: "british band",
        similarArtists: ["The Smiths"],
      },
    ];
    const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, NAME);
    expect(merged).toEqual({
      name: NAME,
      imageUrl: "https://deezer/img",
      genres: ["alt-rock"],
      popularity: 1_500_000,
      followers: 2_000_000,
      scrobbles: 500_000_000,
      bioSummary: "british band",
      similarArtists: ["The Smiths"],
      topTracks: [],
    });
  });

  it("ignores duplicate source entries (last write wins per source)", () => {
    const partials: ArtistPartial[] = [
      { __source: "deezer", imageUrl: "https://first" },
      { __source: "deezer", imageUrl: "https://second" },
    ];
    const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, NAME);
    expect(merged.imageUrl).toBe("https://second");
  });
});
