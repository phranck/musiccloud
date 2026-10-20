import { describe, expect, it } from "vitest";
import type { NormalizedAlbum, NormalizedTrack } from "../../../types.js";
import { isFreeTextSearch, scoreAlbumCandidate, scoreSearchCandidate, searchText } from "../confidence.js";

describe("isFreeTextSearch", () => {
  it("keeps known self-titled recordings structured", () => {
    const query = { title: "Black Sabbath", artist: "Black Sabbath", artists: ["Black Sabbath"] };
    expect(isFreeTextSearch(query)).toBe(false);
    expect(searchText(query)).toBe("Black Sabbath Black Sabbath");
  });

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

  it.each([
    {
      label: "studio recording with featured-artist credits",
      sourceId: "69kOkLUCkxIZYexIgSG8rq",
      title: "Get Lucky (feat. Pharrell Williams and Nile Rodgers)",
      artists: ["Daft Punk", "Pharrell Williams", "Nile Rodgers"],
      expected: 0.8,
    },
    {
      label: "different live performance",
      sourceId: "0RUqiaUcnNrfOJLKV7rWgW",
      title: "Get Lucky - Live",
      artists: ["Daft Punk", "JBBFO Jugend Brass Band Forum Ostschweiz", "José Rafael Pascual Vilaplana"],
      expected: 0,
    },
    {
      label: "cover band with a similar artist name",
      sourceId: "2pA2IoMpMbLVDc1qDGg4UC",
      title: "Get Lucky",
      artists: ["Daft Punk Experience", "Zico Oliveira"],
      expected: 0,
    },
  ])("preserves recording identity for a $label", ({ sourceId, title, artists, expected }) => {
    const candidate: NormalizedTrack = {
      sourceService: "spotify",
      sourceId,
      title,
      artists,
      webUrl: `https://open.spotify.com/track/${sourceId}`,
    };
    const query = { title: "Get Lucky", artist: "Daft Punk", artists: ["Daft Punk"] };
    expect(scoreSearchCandidate(query, candidate, 0)).toBeCloseTo(expected, 5);
    expect(candidate.title).toBe(title);
    expect(query.title).toBe("Get Lucky");
  });

  it("compares a combined provider credit without penalizing its primary artist", () => {
    const candidate: NormalizedTrack = {
      sourceService: "qobuz",
      sourceId: "8767428",
      title: "Get Lucky",
      artists: ["Daft Punk ft. Pharrell Williams"],
      webUrl: "https://open.qobuz.com/track/8767428",
    };
    expect(
      scoreSearchCandidate({ title: "Get Lucky", artist: "Daft Punk", artists: ["Daft Punk"] }, candidate, 0),
    ).toBeCloseTo(0.8, 5);
    expect(candidate.artists).toEqual(["Daft Punk ft. Pharrell Williams"]);
  });

  it("compares an original query's explicit collaboration credit without rewriting it", () => {
    const query = {
      title: "Get Lucky",
      artist: "Daft Punk ft. Pharrell Williams",
      artists: ["Daft Punk ft. Pharrell Williams"],
    };
    const candidate: NormalizedTrack = {
      sourceService: "spotify",
      sourceId: "69kOkLUCkxIZYexIgSG8rq",
      title: "Get Lucky",
      artists: ["Daft Punk"],
      webUrl: "https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq",
    };
    expect(scoreSearchCandidate(query, candidate, 0)).toBeCloseTo(0.8);
    expect(query.artists).toEqual(["Daft Punk ft. Pharrell Williams"]);
  });

  it("compares Bugs' published bilingual label without changing the provider credit", () => {
    const candidate: NormalizedTrack = {
      sourceService: "bugs",
      sourceId: "3109585",
      title: "Get Lucky (Daft Punk Remix)",
      artists: ["Daft Punk(다프트 펑크)"],
      webUrl: "https://music.bugs.co.kr/track/3109585",
    };
    expect(
      scoreSearchCandidate({ title: candidate.title, artist: "Daft Punk", artists: ["Daft Punk"] }, candidate, 0),
    ).toBeCloseTo(0.8);
    expect(candidate.artists).toEqual(["Daft Punk(다프트 펑크)"]);
  });

  it.each([
    { service: "spotify", name: "Daft Punk(다프트 펑크)" },
    { service: "bugs", name: "Daft Punk (Tribute Band)" },
  ])("does not invent a provider alias for $service / $name", ({ service, name }) => {
    const candidate: NormalizedTrack = {
      sourceService: service === "bugs" ? "bugs" : "spotify",
      sourceId: "test",
      title: "Get Lucky",
      artists: [name],
      webUrl: "",
    };
    expect(
      scoreSearchCandidate({ title: candidate.title, artist: "Daft Punk", artists: ["Daft Punk"] }, candidate, 0),
    ).toBe(0);
  });

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

  it("uses the same provider-reported bilingual artist interpretation for album scores", () => {
    const candidate: NormalizedAlbum = {
      sourceService: "bugs",
      sourceId: "test-album",
      title: "Random Access Memories",
      artists: ["Daft Punk(다프트 펑크)"],
      webUrl: "",
    };
    expect(scoreAlbumCandidate({ title: candidate.title, artist: "Daft Punk" }, candidate)).toBeCloseTo(0.7);
    expect(candidate.artists).toEqual(["Daft Punk(다프트 펑크)"]);
  });

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
