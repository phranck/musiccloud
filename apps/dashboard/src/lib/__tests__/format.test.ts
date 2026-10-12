import { describe, expect, it } from "vitest";
import { formatAdminName, formatEnglishDate, formatEnglishNumber, formatPartialDate } from "@/lib/format";

describe("English dashboard formatting", () => {
  it("formats dates in English while preserving explicit timezone options", () => {
    expect(
      formatEnglishDate("2026-01-02T00:00:00.000Z", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    ).toBe("Jan 2, 2026");
  });

  it("formats numbers in English deterministically", () => {
    expect(formatEnglishNumber(1234)).toBe("1,234");
  });
});

describe("formatPartialDate", () => {
  it("writes only the parts the precision covers", () => {
    expect(formatPartialDate({ precision: "day", year: 1968, month: 10, day: 7 })).toBe("October 7, 1968");
    expect(formatPartialDate({ precision: "month", year: 1968, month: 10, day: null })).toBe("October 1968");
    expect(formatPartialDate({ precision: "year", year: 1968, month: null, day: null })).toBe("1968");
  });

  it("keeps a first of the month on that day whatever the local time zone", () => {
    expect(formatPartialDate({ precision: "day", year: 1985, month: 1, day: 1 })).toBe("January 1, 1985");
  });

  it("answers null where not even the year is known", () => {
    expect(formatPartialDate(null)).toBeNull();
    expect(formatPartialDate({ precision: "unknown", year: null, month: null, day: null })).toBeNull();
  });
});

describe("formatAdminName", () => {
  it("names an admin by first and last name where either is set", () => {
    expect(formatAdminName({ username: "olive", firstName: "Olive", lastName: "Owner" })).toBe("Olive Owner");
    expect(formatAdminName({ username: "olive", firstName: null, lastName: "Owner" })).toBe("Owner");
  });

  it("falls back to the username when no name is set", () => {
    expect(formatAdminName({ username: "oscar", firstName: null, lastName: null })).toBe("oscar");
    expect(formatAdminName({ username: "oscar", firstName: "", lastName: "" })).toBe("oscar");
  });
});
