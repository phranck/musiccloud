import { describe, expect, it } from "vitest";
import { collectAlbumExternalIds, collectArtistExternalIds, collectTrackExternalIds } from "../services/external-ids";
import type { NormalizedAlbum, NormalizedArtist, NormalizedTrack } from "../services/types";

const baseTrack: NormalizedTrack = {
  sourceService: "spotify",
  sourceId: "abc",
  title: "T",
  artists: ["A"],
  webUrl: "https://open.spotify.com/track/abc",
};

const baseAlbum: NormalizedAlbum = {
  sourceService: "spotify",
  sourceId: "abc",
  title: "A",
  artists: ["X"],
  webUrl: "https://open.spotify.com/album/abc",
};

const baseArtist: NormalizedArtist = {
  sourceService: "spotify",
  sourceId: "abc",
  name: "X",
  webUrl: "https://open.spotify.com/artist/abc",
};

describe("collectTrackExternalIds", () => {
  it("emits the source-track ISRC under its sourceService", () => {
    const records = collectTrackExternalIds({ ...baseTrack, isrc: "ABCDE1234567" });

    expect(records).toEqual([{ idType: "isrc", idValue: "ABCDE1234567", sourceService: "spotify" }]);
  });

  it("includes ISRCs reported by cross-service links", () => {
    const records = collectTrackExternalIds({ ...baseTrack, isrc: "ABCDE1234567" }, [
      { service: "deezer", isrc: "ABCDE1234567" },
      { service: "apple-music", isrc: "ZXY9876543" },
    ]);

    expect(records).toContainEqual({ idType: "isrc", idValue: "ABCDE1234567", sourceService: "spotify" });
    expect(records).toContainEqual({ idType: "isrc", idValue: "ABCDE1234567", sourceService: "deezer" });
    expect(records).toContainEqual({ idType: "isrc", idValue: "ZXY9876543", sourceService: "apple-music" });
  });

  it("drops link observations without an ISRC", () => {
    const records = collectTrackExternalIds(baseTrack, [
      { service: "deezer" },
      { service: "apple-music", isrc: "FILL" },
    ]);

    expect(records).toEqual([{ idType: "isrc", idValue: "FILL", sourceService: "apple-music" }]);
  });

  it("drops the synthetic 'cached' source-service so cache hits never poison the aggregation", () => {
    const records = collectTrackExternalIds({ ...baseTrack, sourceService: "cached", isrc: "ABCDE1234567" });

    expect(records).toEqual([]);
  });

  it("collapses duplicate (idType, idValue, sourceService) tuples", () => {
    const records = collectTrackExternalIds({ ...baseTrack, isrc: "DUP" }, [
      { service: "spotify", isrc: "DUP" }, // same as source — must not duplicate
      { service: "deezer", isrc: "DUP" },
      { service: "deezer", isrc: "DUP" }, // exact dup — must not duplicate
    ]);

    expect(records).toHaveLength(2);
    expect(records).toContainEqual({ idType: "isrc", idValue: "DUP", sourceService: "spotify" });
    expect(records).toContainEqual({ idType: "isrc", idValue: "DUP", sourceService: "deezer" });
  });

  it("returns an empty array when the source track has no ISRC and no observations", () => {
    expect(collectTrackExternalIds(baseTrack)).toEqual([]);
  });
});

describe("collectAlbumExternalIds", () => {
  it("emits the source-album UPC plus link observations", () => {
    const records = collectAlbumExternalIds({ ...baseAlbum, upc: "0001" }, [
      { service: "deezer", upc: "0001" },
      { service: "apple-music", upc: "0002" },
    ]);

    expect(records).toContainEqual({ idType: "upc", idValue: "0001", sourceService: "spotify" });
    expect(records).toContainEqual({ idType: "upc", idValue: "0001", sourceService: "deezer" });
    expect(records).toContainEqual({ idType: "upc", idValue: "0002", sourceService: "apple-music" });
  });

  it("drops 'cached' source and missing values", () => {
    const records = collectAlbumExternalIds({ ...baseAlbum, sourceService: "cached", upc: "X" }, [
      { service: "deezer" },
    ]);

    expect(records).toEqual([]);
  });
});

describe("collectArtistExternalIds", () => {
  it("returns an empty array because no current adapter exposes artist external IDs", () => {
    // The function exists so the upcoming MusicBrainz adapter can wire its
    // MBID output through `artistExternalIds` without further code changes
    // in the resolver. Until then, artist resolves emit no records.
    expect(collectArtistExternalIds(baseArtist)).toEqual([]);
  });
});
