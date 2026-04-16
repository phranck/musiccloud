import { describe, expect, it } from "vitest";
import { GenreQueryParseError, parseGenreQuery } from "@/services/genre-search/parser";

describe("parseGenreQuery — defaults", () => {
  it("returns all three types at default count when only genre is given", () => {
    expect(parseGenreQuery("genre: jazz")).toEqual({
      genres: ["jazz"],
      tracks: 10,
      albums: 10,
      artists: 10,
      vibe: "hot",
      warnings: [],
    });
  });

  it("defaults vibe to 'hot'", () => {
    expect(parseGenreQuery("genre: jazz").vibe).toBe("hot");
  });
});

describe("parseGenreQuery — whitespace tolerance", () => {
  it("accepts no space around colon", () => {
    expect(parseGenreQuery("genre:jazz").genres).toEqual(["jazz"]);
  });

  it("accepts multiple spaces around colon", () => {
    expect(parseGenreQuery("genre   :   jazz").genres).toEqual(["jazz"]);
  });

  it("accepts multiple spaces around comma", () => {
    const result = parseGenreQuery("genre: jazz   ,   tracks: 5");
    expect(result.genres).toEqual(["jazz"]);
    expect(result.tracks).toBe(5);
  });

  it("trims leading and trailing whitespace on entire input", () => {
    expect(parseGenreQuery("   genre: jazz   ").genres).toEqual(["jazz"]);
  });

  it("handles the full kitchen-sink case", () => {
    expect(parseGenreQuery("  Genre : Jazz|Rock  ,  Tracks : 5  ,  Vibe : Mixed  ")).toEqual({
      genres: ["Jazz", "Rock"],
      tracks: 5,
      albums: null,
      artists: null,
      vibe: "mixed",
      warnings: [],
    });
  });
});

describe("parseGenreQuery — case-insensitive keys", () => {
  it("accepts uppercase key", () => {
    expect(parseGenreQuery("GENRE: jazz").genres).toEqual(["jazz"]);
  });

  it("accepts mixed-case key", () => {
    expect(parseGenreQuery("Genre: jazz").genres).toEqual(["jazz"]);
  });

  it("preserves value case (does not lowercase genre names)", () => {
    expect(parseGenreQuery("genre: Hip Hop").genres).toEqual(["Hip Hop"]);
  });

  it("case-insensitive vibe value", () => {
    expect(parseGenreQuery("genre: jazz, vibe: MIXED").vibe).toBe("mixed");
  });
});

describe("parseGenreQuery — OR operator", () => {
  it("splits genre on |", () => {
    expect(parseGenreQuery("genre: jazz|blues").genres).toEqual(["jazz", "blues"]);
  });

  it("trims whitespace around | segments", () => {
    expect(parseGenreQuery("genre: jazz | blues").genres).toEqual(["jazz", "blues"]);
  });

  it("preserves multi-word values across | splits", () => {
    expect(parseGenreQuery("genre: hip hop|r&b").genres).toEqual(["hip hop", "r&b"]);
  });

  it("filters out empty segments from | split", () => {
    expect(parseGenreQuery("genre: jazz||blues").genres).toEqual(["jazz", "blues"]);
  });
});

describe("parseGenreQuery — type-specific mode", () => {
  it("returns only tracks when only tracks is specified", () => {
    const result = parseGenreQuery("genre: jazz, tracks: 20");
    expect(result).toEqual({
      genres: ["jazz"],
      tracks: 20,
      albums: null,
      artists: null,
      vibe: "hot",
      warnings: [],
    });
  });

  it("returns only tracks + albums when both are specified", () => {
    const result = parseGenreQuery("genre: jazz, tracks: 20, albums: 10");
    expect(result.tracks).toBe(20);
    expect(result.albums).toBe(10);
    expect(result.artists).toBeNull();
  });

  it("returns only artists when only artists is specified", () => {
    const result = parseGenreQuery("genre: jazz, artists: 15");
    expect(result.tracks).toBeNull();
    expect(result.albums).toBeNull();
    expect(result.artists).toBe(15);
  });
});

describe("parseGenreQuery — auto-insert missing commas", () => {
  it("fixes a missing comma between genre value and count", () => {
    expect(parseGenreQuery("genre: jazz count: 15")).toEqual({
      genres: ["jazz"],
      tracks: 15,
      albums: 15,
      artists: 15,
      vibe: "hot",
      warnings: [],
    });
  });

  it("fixes a missing comma between genre value and tracks", () => {
    const r = parseGenreQuery("genre: jazz tracks: 20");
    expect(r.tracks).toBe(20);
    expect(r.albums).toBeNull();
  });

  it("fixes multiple missing commas in one query", () => {
    expect(parseGenreQuery("genre: jazz tracks: 20 vibe: mixed")).toEqual({
      genres: ["jazz"],
      tracks: 20,
      albums: null,
      artists: null,
      vibe: "mixed",
      warnings: [],
    });
  });

  it("preserves multi-word genre values when a keyword follows", () => {
    const r = parseGenreQuery("genre: hip hop tracks: 10");
    expect(r.genres).toEqual(["hip hop"]);
    expect(r.tracks).toBe(10);
  });

  it("does not touch queries that already use commas", () => {
    const r = parseGenreQuery("genre: jazz, count: 15");
    expect(r).toEqual({ genres: ["jazz"], tracks: 15, albums: 15, artists: 15, vibe: "hot", warnings: [] });
  });

  it("leaves values alone when a keyword-shaped word has no colon", () => {
    // "albums" here is part of the (nonsense) genre value, not a key.
    // Because there's no colon after "albums", the auto-comma fix-up
    // doesn't fire and the genre-name resolver will reject it later.
    const r = parseGenreQuery("genre: albums rock");
    expect(r.genres).toEqual(["albums rock"]);
  });
});

describe("parseGenreQuery — count (global shorthand)", () => {
  it("applies count to all three types when no type-specific keys are given", () => {
    expect(parseGenreQuery("genre: jazz, count: 15")).toEqual({
      genres: ["jazz"],
      tracks: 15,
      albums: 15,
      artists: 15,
      vibe: "hot",
      warnings: [],
    });
  });

  it("pairs cleanly with vibe", () => {
    expect(parseGenreQuery("genre: jazz, count: 20, vibe: mixed")).toEqual({
      genres: ["jazz"],
      tracks: 20,
      albums: 20,
      artists: 20,
      vibe: "mixed",
      warnings: [],
    });
  });

  it("applies last-wins when count is followed by tracks, with a warning", () => {
    const r = parseGenreQuery("genre: jazz, count: 15, tracks: 20");
    expect(r.tracks).toBe(20);
    expect(r.albums).toBe(15);
    expect(r.artists).toBe(15);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/count/i);
  });

  it("applies last-wins when count follows tracks, with a warning", () => {
    // tracks set first → 20; count after → all three set to 15
    const r = parseGenreQuery("genre: jazz, tracks: 20, count: 15");
    expect(r.tracks).toBe(15);
    expect(r.albums).toBe(15);
    expect(r.artists).toBe(15);
    expect(r.warnings).toHaveLength(1);
  });

  it("applies last-wins for mixed count+albums+artists", () => {
    const r = parseGenreQuery("genre: jazz, count: 15, albums: 5, artists: 3");
    expect(r.tracks).toBe(15);
    expect(r.albums).toBe(5);
    expect(r.artists).toBe(3);
    expect(r.warnings).toHaveLength(1);
  });

  it("emits no warning when count is used alone", () => {
    expect(parseGenreQuery("genre: jazz, count: 15").warnings).toEqual([]);
  });

  it("emits no warning when only per-type fields are used", () => {
    expect(parseGenreQuery("genre: jazz, tracks: 20, albums: 5").warnings).toEqual([]);
  });

  it("validates count as a positive integer within range", () => {
    expect(() => parseGenreQuery("genre: jazz, count: 0")).toThrow(/at least 1/i);
    expect(() => parseGenreQuery("genre: jazz, count: 100")).toThrow(/at most 50/i);
    expect(() => parseGenreQuery("genre: jazz, count: abc")).toThrow(/positive integer/i);
  });
});

describe("parseGenreQuery — vibe", () => {
  it("accepts 'hot'", () => {
    expect(parseGenreQuery("genre: jazz, vibe: hot").vibe).toBe("hot");
  });

  it("accepts 'mixed'", () => {
    expect(parseGenreQuery("genre: jazz, vibe: mixed").vibe).toBe("mixed");
  });

  it("rejects other vibe values", () => {
    expect(() => parseGenreQuery("genre: jazz, vibe: cold")).toThrow(GenreQueryParseError);
    expect(() => parseGenreQuery("genre: jazz, vibe: cold")).toThrow(/vibe/);
  });
});

describe("parseGenreQuery — errors", () => {
  it("rejects empty input", () => {
    expect(() => parseGenreQuery("")).toThrow(/empty/i);
  });

  it("rejects whitespace-only input", () => {
    expect(() => parseGenreQuery("   ")).toThrow(/empty/i);
  });

  it("rejects input without genre field", () => {
    expect(() => parseGenreQuery("tracks: 20")).toThrow(/missing required field/i);
  });

  it("rejects genre with empty value", () => {
    expect(() => parseGenreQuery("genre:")).toThrow(/missing value/i);
  });

  it("rejects genre with whitespace-only value", () => {
    expect(() => parseGenreQuery("genre:   ")).toThrow(/missing value/i);
  });

  it("rejects genre with only pipe separators (no real values)", () => {
    expect(() => parseGenreQuery("genre: ||")).toThrow(/missing value/i);
  });

  it("rejects unknown field", () => {
    expect(() => parseGenreQuery("genre: jazz, foo: bar")).toThrow(/unknown field/i);
  });

  it("rejects duplicate field", () => {
    expect(() => parseGenreQuery("genre: jazz, genre: rock")).toThrow(/duplicate/i);
  });

  it("rejects non-numeric count", () => {
    expect(() => parseGenreQuery("genre: jazz, tracks: abc")).toThrow(/positive integer/i);
  });

  it("rejects negative count", () => {
    expect(() => parseGenreQuery("genre: jazz, tracks: -5")).toThrow(/positive integer/i);
  });

  it("rejects zero count", () => {
    expect(() => parseGenreQuery("genre: jazz, tracks: 0")).toThrow(/at least 1/i);
  });

  it("rejects count above max", () => {
    expect(() => parseGenreQuery("genre: jazz, tracks: 100")).toThrow(/at most 50/i);
  });

  it("rejects segment without colon", () => {
    expect(() => parseGenreQuery("genre jazz")).toThrow(/expected 'key: value'/i);
  });

  it("rejects missing key before colon", () => {
    expect(() => parseGenreQuery(": jazz")).toThrow(/missing key/i);
  });

  it("errors are instances of GenreQueryParseError", () => {
    expect(() => parseGenreQuery("")).toThrow(GenreQueryParseError);
    expect(() => parseGenreQuery("tracks: 20")).toThrow(GenreQueryParseError);
    expect(() => parseGenreQuery("genre: jazz, foo: bar")).toThrow(GenreQueryParseError);
  });
});

describe("parseGenreQuery — realistic examples from spec", () => {
  it("handles: genre: jazz", () => {
    const r = parseGenreQuery("genre: jazz");
    expect(r.genres).toEqual(["jazz"]);
    expect(r.tracks).toBe(10);
    expect(r.albums).toBe(10);
    expect(r.artists).toBe(10);
  });

  it("handles: genre: hip hop|r&b, tracks: 20", () => {
    const r = parseGenreQuery("genre: hip hop|r&b, tracks: 20");
    expect(r.genres).toEqual(["hip hop", "r&b"]);
    expect(r.tracks).toBe(20);
    expect(r.albums).toBeNull();
    expect(r.artists).toBeNull();
  });

  it("handles: genre: jazz|blues, albums: 15, vibe: mixed", () => {
    const r = parseGenreQuery("genre: jazz|blues, albums: 15, vibe: mixed");
    expect(r.genres).toEqual(["jazz", "blues"]);
    expect(r.tracks).toBeNull();
    expect(r.albums).toBe(15);
    expect(r.artists).toBeNull();
    expect(r.vibe).toBe("mixed");
  });
});
