import { describe, expect, it } from "vitest";
import { normalizeReleaseDate } from "../../../lib/release-date.js";

/**
 * `tracks.release_date` and `albums.release_date` are written from
 * `normalizeReleaseDate` so the columns only ever hold a bare `YYYY-MM-DD` (the
 * share response schema validates it as `format: date`). Source services report
 * several formats.
 */
describe("normalizeReleaseDate", () => {
  it("keeps a bare YYYY-MM-DD date", () => {
    expect(normalizeReleaseDate("2007-09-01")).toBe("2007-09-01");
  });

  it("trims an ISO-8601 timestamp to its date prefix (YouTube/SoundCloud)", () => {
    expect(normalizeReleaseDate("2009-10-07T23:12:34Z")).toBe("2009-10-07");
  });

  it("parses an RFC-2822 date to its UTC date (Bandcamp)", () => {
    expect(normalizeReleaseDate("15 Sep 2025 00:00:00 GMT")).toBe("2025-09-15");
  });

  it("drops a bare year (not a valid `format: date`)", () => {
    expect(normalizeReleaseDate("2018")).toBeNull();
  });

  it("drops a year and month rather than making up the first of the month", () => {
    expect(normalizeReleaseDate("1975-11")).toBeNull();
  });

  it("drops an unparseable value", () => {
    expect(normalizeReleaseDate("not a date")).toBeNull();
  });

  it("drops an ISO-shaped value that is not a real calendar date", () => {
    expect(normalizeReleaseDate("2026-02-30T00:00:00Z")).toBeNull();
  });

  it("drops null / undefined / empty", () => {
    expect(normalizeReleaseDate(null)).toBeNull();
    expect(normalizeReleaseDate(undefined)).toBeNull();
    expect(normalizeReleaseDate("")).toBeNull();
  });
});
