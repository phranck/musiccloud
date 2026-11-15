import { describe, expect, it } from "vitest";
import { CORRELATION_ID_HEADER, CORRELATION_ID_MAX_LENGTH, CORRELATION_ID_PATTERN } from "../request-correlation.js";

describe("share request correlation", () => {
  it("uses one bounded header contract for frontend and backend", () => {
    expect(CORRELATION_ID_HEADER).toBe("x-mc-correlation-id");
    expect(CORRELATION_ID_MAX_LENGTH).toBe(64);
    expect(CORRELATION_ID_PATTERN.test("1d6f8b8c-0d3c-4c88-a8f2-8e73d95f812d")).toBe(true);
  });

  it("rejects whitespace, URL punctuation, non-ASCII text, and overlong values", () => {
    for (const value of ["has space", "slash/value", "ä", "a".repeat(65)]) {
      expect(CORRELATION_ID_PATTERN.test(value)).toBe(false);
    }
  });
});
