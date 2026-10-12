import { describe, expect, it } from "vitest";

import { partialDateFromParts } from "../artist-identity.js";

describe("partialDateFromParts", () => {
  it("clears the parts beyond the precision", () => {
    expect(partialDateFromParts("year", 1985, 6, 12)).toEqual({
      precision: "year",
      year: 1985,
      month: null,
      day: null,
    });
    expect(partialDateFromParts("month", 1985, 6, 12)).toEqual({ precision: "month", year: 1985, month: 6, day: null });
    expect(partialDateFromParts("day", 1985, 6, 12)).toEqual({ precision: "day", year: 1985, month: 6, day: 12 });
  });

  it("answers null where nothing is known", () => {
    expect(partialDateFromParts("unknown", null, null, null)).toBeNull();
  });
});
