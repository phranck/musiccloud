import { describe, expect, it } from "vitest";
import { parseReleaseYear } from "./release-date.js";

describe("parseReleaseYear", () => {
  it("reads the year of a bare year, a year and month, and a full date", () => {
    expect(parseReleaseYear("1959")).toBe(1959);
    expect(parseReleaseYear("1975-11")).toBe(1975);
    expect(parseReleaseYear("2007-09-01")).toBe(2007);
  });

  it("reads the year of a Discogs date with an unknown month and day", () => {
    expect(parseReleaseYear("1959-00-00")).toBe(1959);
  });

  it("reads the year of an ISO timestamp and ignores surrounding whitespace", () => {
    expect(parseReleaseYear("2009-10-07T23:12:34Z")).toBe(2009);
    expect(parseReleaseYear("  1961 ")).toBe(1961);
  });

  it("reports a value that does not open with a year as unknown", () => {
    expect(parseReleaseYear("unknown")).toBeNull();
    expect(parseReleaseYear("15 Sep 2025 00:00:00 GMT")).toBeNull();
    expect(parseReleaseYear("195")).toBeNull();
  });

  it("reports a missing or empty value as unknown", () => {
    expect(parseReleaseYear(null)).toBeNull();
    expect(parseReleaseYear(undefined)).toBeNull();
    expect(parseReleaseYear("")).toBeNull();
    expect(parseReleaseYear("   ")).toBeNull();
  });
});
