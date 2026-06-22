import { afterEach, describe, expect, it, vi } from "vitest";
import { detectRegion, TIMEZONE_TO_COUNTRY } from "@/lib/geo/detect-region";

/**
 * Replaces `Intl.DateTimeFormat().resolvedOptions().timeZone` with a fixed
 * value (or makes the call throw) for one test, restoring the real `Intl`
 * after each case via `afterEach`.
 */
function stubResolvedTimeZone(timeZone: string | (() => never)): void {
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
    () =>
      ({
        resolvedOptions: () => {
          if (typeof timeZone === "function") timeZone();
          return { timeZone } as Intl.ResolvedDateTimeFormatOptions;
        },
      }) as Intl.DateTimeFormat,
  );
}

describe("detect-region", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("TIMEZONE_TO_COUNTRY", () => {
    it("maps representative IANA timezones to their ISO 3166-1 alpha-2 codes", () => {
      expect(TIMEZONE_TO_COUNTRY["Europe/Vienna"]).toBe("AT");
      expect(TIMEZONE_TO_COUNTRY["Europe/Berlin"]).toBe("DE");
      expect(TIMEZONE_TO_COUNTRY["America/New_York"]).toBe("US");
      expect(TIMEZONE_TO_COUNTRY["Asia/Tokyo"]).toBe("JP");
      expect(TIMEZONE_TO_COUNTRY["Pacific/Auckland"]).toBe("NZ");
    });

    it("maps multiple US timezones to the same country code", () => {
      expect(TIMEZONE_TO_COUNTRY["America/Chicago"]).toBe("US");
      expect(TIMEZONE_TO_COUNTRY["America/Los_Angeles"]).toBe("US");
      expect(TIMEZONE_TO_COUNTRY["America/Phoenix"]).toBe("US");
    });
  });

  describe("detectRegion", () => {
    it("returns the ISO code for a mapped timezone", () => {
      stubResolvedTimeZone("Europe/Berlin");
      expect(detectRegion()).toBe("DE");
    });

    it("returns the empty string for an unmapped timezone", () => {
      stubResolvedTimeZone("Antarctica/Troll");
      expect(detectRegion()).toBe("");
    });

    it("returns the empty string when reading the timezone throws", () => {
      stubResolvedTimeZone(() => {
        throw new Error("Intl unavailable");
      });
      expect(detectRegion()).toBe("");
    });
  });
});
