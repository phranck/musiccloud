import { describe, expect, it } from "vitest";
import { formatAdminName, formatEnglishDate, formatEnglishNumber } from "@/lib/format";

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
