import { describe, expect, it } from "vitest";
import { toIsoDateOnly } from "../share-page.js";

/**
 * The Track/Album share response schema validates `releaseDate` as `format: date`
 * (strict `YYYY-MM-DD`). Some sources (YouTube, Bandcamp, SoundCloud) store a full
 * ISO-8601 timestamp, which fails serialization and 500s the whole share. The
 * loader normalizes the value through `toIsoDateOnly` before it reaches the schema.
 */
describe("toIsoDateOnly", () => {
  it("keeps a valid YYYY-MM-DD date unchanged", () => {
    expect(toIsoDateOnly("2007-09-01")).toBe("2007-09-01");
  });

  it("truncates a full ISO-8601 timestamp to its date prefix", () => {
    expect(toIsoDateOnly("2009-10-07T23:12:34Z")).toBe("2009-10-07");
    expect(toIsoDateOnly("2009-06-16T22:08:06Z")).toBe("2009-06-16");
  });

  it("drops a year-only value (it is not a valid `format: date`)", () => {
    expect(toIsoDateOnly("2018")).toBeNull();
  });

  it("drops an unparseable value rather than letting it reach the schema", () => {
    expect(toIsoDateOnly("not a date")).toBeNull();
    expect(toIsoDateOnly("")).toBeNull();
    expect(toIsoDateOnly(null)).toBeNull();
  });
});
