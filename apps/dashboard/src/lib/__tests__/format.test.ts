import { describe, expect, it } from "vitest";
import { formatEnglishDate, formatEnglishNumber } from "@/lib/format";

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
