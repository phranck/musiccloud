import { describe, expect, it } from "vitest";
import { isFreeTextSearch, scoreAlbumCandidate, scoreSearchCandidate, searchText } from "../confidence.js";

describe("isFreeTextSearch", () => {
  it("reads the resolver's mark for free text, the same string as title and artist", () => {
    expect(isFreeTextSearch({ title: "slowdive alison", artist: "slowdive alison" })).toBe(true);
    expect(isFreeTextSearch({ title: "Alison", artist: "Slowdive" })).toBe(false);
  });
});

describe("searchText", () => {
  it("asks with the text itself for a free-text search", () => {
    expect(searchText({ title: "slowdive alison", artist: "slowdive alison" })).toBe("slowdive alison");
  });

  it("asks with the artist followed by the title otherwise", () => {
    expect(searchText({ title: "Alison", artist: "Slowdive" })).toBe("Slowdive Alison");
  });
});

describe("scoreSearchCandidate", () => {
  const track = { sourceService: "deezer", sourceId: "1", title: "Alison", artists: ["Slowdive"], webUrl: "" } as const;

  it("trusts the service's ranking for a free-text search", () => {
    const query = { title: "slowdive alison", artist: "slowdive alison" };
    expect(scoreSearchCandidate(query, track, 0)).toBeCloseTo(0.85, 5);
    expect(scoreSearchCandidate(query, track, 20)).toBeCloseTo(0.4, 5);
  });

  it("compares title and artist for a structured search, whatever the position", () => {
    const query = { title: "Alison", artist: "Slowdive" };
    expect(scoreSearchCandidate(query, track, 5)).toBe(scoreSearchCandidate(query, track, 0));
    expect(scoreSearchCandidate(query, { ...track, title: "Souvlaki Space Station" }, 0)).toBeLessThan(
      scoreSearchCandidate(query, track, 0),
    );
  });
});

describe("scoreAlbumCandidate", () => {
  const query = { title: "Souvlaki", artist: "Slowdive", year: "1993", totalTracks: 10 };
  const album = { title: "Souvlaki", artists: ["Slowdive"] };

  it("counts the year the user asked for", () => {
    const sameYear = scoreAlbumCandidate(query, { ...album, releaseDate: "1993-06-01" });
    const otherYear = scoreAlbumCandidate(query, { ...album, releaseDate: "2005-01-01" });
    expect(sameYear - otherYear).toBeCloseTo(0.15, 5);
  });

  it("counts the track count, so a deluxe edition scores below the standard one", () => {
    const standard = scoreAlbumCandidate(query, { ...album, totalTracks: 10 });
    const deluxe = scoreAlbumCandidate(query, { ...album, totalTracks: 22 });
    expect(standard - deluxe).toBeCloseTo(0.15, 5);
  });

  it("adds nothing for a term the candidate does not report", () => {
    expect(scoreAlbumCandidate(query, album)).toBeCloseTo(0.7, 5);
  });
});
