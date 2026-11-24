import { describe, expect, it } from "vitest";
import { artistNamesOrUnknown, splitArtistNames, UNKNOWN_ARTIST, uniqueArtistNames } from "../artists.js";

describe("artistNamesOrUnknown", () => {
  it("answers the unknown credit only for a list the provider left out", () => {
    expect(artistNamesOrUnknown(undefined)).toEqual([UNKNOWN_ARTIST]);
  });

  it("keeps an empty list empty, as the structured adapters always have", () => {
    expect(artistNamesOrUnknown([])).toEqual([]);
  });

  it("drops blank names and keeps the rest in credit order", () => {
    expect(artistNamesOrUnknown(["B", "", undefined, "A", null])).toEqual(["B", "A"]);
  });

  it("keeps a list without any usable name empty", () => {
    expect(artistNamesOrUnknown(["", undefined])).toEqual([]);
  });
});

describe("splitArtistNames", () => {
  it("falls back to the unknown credit by default", () => {
    expect(splitArtistNames(undefined)).toEqual([UNKNOWN_ARTIST]);
    expect(splitArtistNames(", &")).toEqual([UNKNOWN_ARTIST]);
  });

  it("splits on commas and ampersands", () => {
    expect(splitArtistNames("A, B & C")).toEqual(["A", "B", "C"]);
  });
});

describe("uniqueArtistNames", () => {
  it("trims, drops blanks and keeps the first spelling of a case-insensitive duplicate", () => {
    expect(uniqueArtistNames([" Daft Punk ", "", "daft punk", "Pharrell"])).toEqual(["Daft Punk", "Pharrell"]);
  });
});
