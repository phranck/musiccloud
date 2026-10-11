import { describe, expect, it } from "vitest";
import { confidenceForMethod } from "./confidence.js";
import { IDENTIFIER_MATCH_CONFIDENCE, SEARCH_MAX_CONFIDENCE } from "./constants.js";

/**
 * The scale exists so one number answers one question. These cases pin the part
 * a caller is invited to rely on: that reading `1` means the link names the
 * recording, and never that a text search scored well.
 */
describe("confidenceForMethod", () => {
  it("lets an identifier match reach the top of the scale", () => {
    for (const method of ["isrc", "upc", "isrc-inference"] as const) {
      expect(confidenceForMethod(method, 1)).toBe(IDENTIFIER_MATCH_CONFIDENCE);
    }
  });

  it("lets the source link reach the top, because it is the address that came in", () => {
    expect(confidenceForMethod("source", 1)).toBe(IDENTIFIER_MATCH_CONFIDENCE);
  });

  it("holds a text search below the top however well it scored", () => {
    expect(confidenceForMethod("search", 1)).toBe(SEARCH_MAX_CONFIDENCE);
    expect(confidenceForMethod("search", 1)).toBeLessThan(1);
  });

  it("leaves a text search that scored below the ceiling alone", () => {
    expect(confidenceForMethod("search", 0.72)).toBe(0.72);
    expect(confidenceForMethod("search", SEARCH_MAX_CONFIDENCE)).toBe(SEARCH_MAX_CONFIDENCE);
  });

  it("leaves the search fallback at whatever it was given", () => {
    expect(confidenceForMethod("search-fallback", 0.5)).toBe(0.5);
  });

  /**
   * The one comparison the published contract invites a caller to make.
   */
  it("never lets a search reach the value reserved for an identifier match", () => {
    for (const score of [0.9, 0.99, 0.999, 1, 1.5]) {
      expect(confidenceForMethod("search", score)).toBeLessThan(IDENTIFIER_MATCH_CONFIDENCE);
    }
  });
});
