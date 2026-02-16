import { describe, it, expect } from "vitest";
import {
  normalizeTitle,
  normalizeArtists,
  stringSimilarity,
  isDurationMatch,
  calculateConfidence,
} from "../lib/normalize";

// =============================================================================
// normalizeTitle
// =============================================================================

describe("normalizeTitle", () => {
  it("should strip (Official Video) for YouTube", () => {
    expect(normalizeTitle("Bohemian Rhapsody (Official Video)", "youtube")).toBe(
      "Bohemian Rhapsody",
    );
  });

  it("should strip [Official Music Video] for YouTube", () => {
    expect(
      normalizeTitle("Shape of You [Official Music Video]", "youtube"),
    ).toBe("Shape of You");
  });

  it("should strip (Official Audio) for YouTube", () => {
    expect(normalizeTitle("Blinding Lights (Official Audio)", "youtube")).toBe(
      "Blinding Lights",
    );
  });

  it("should strip (Lyrics Video) for YouTube", () => {
    expect(normalizeTitle("Bad Guy (Lyrics Video)", "youtube")).toBe("Bad Guy");
  });

  it("should strip [HD] for YouTube", () => {
    expect(normalizeTitle("Yesterday [HD]", "youtube")).toBe("Yesterday");
  });

  it("should not strip anything for Spotify", () => {
    expect(
      normalizeTitle("Bohemian Rhapsody (Official Video)", "spotify"),
    ).toBe("Bohemian Rhapsody (Official Video)");
  });

  it("should trim whitespace for all services", () => {
    expect(normalizeTitle("  Hello  ", "spotify")).toBe("Hello");
    expect(normalizeTitle("  Hello  ", "youtube")).toBe("Hello");
  });
});

// =============================================================================
// normalizeArtists
// =============================================================================

describe("normalizeArtists", () => {
  it("should return trimmed array when given an array", () => {
    expect(normalizeArtists(["  Drake ", " Rihanna  "])).toEqual([
      "Drake",
      "Rihanna",
    ]);
  });

  it("should split string on comma", () => {
    expect(normalizeArtists("Drake, Rihanna")).toEqual(["Drake", "Rihanna"]);
  });

  it("should split string on ampersand", () => {
    expect(normalizeArtists("Drake & Rihanna")).toEqual(["Drake", "Rihanna"]);
  });

  it("should handle multiple separators", () => {
    expect(normalizeArtists("Drake, Rihanna & Future")).toEqual([
      "Drake",
      "Rihanna",
      "Future",
    ]);
  });

  it("should filter out empty strings", () => {
    expect(normalizeArtists("Drake,,Rihanna")).toEqual(["Drake", "Rihanna"]);
  });

  it("should handle single artist string", () => {
    expect(normalizeArtists("Queen")).toEqual(["Queen"]);
  });
});

// =============================================================================
// stringSimilarity (Dice coefficient)
// =============================================================================

describe("stringSimilarity", () => {
  it("should return 1.0 for identical strings", () => {
    expect(stringSimilarity("Bohemian Rhapsody", "Bohemian Rhapsody")).toBe(1.0);
  });

  it("should return 1.0 for case-insensitive match", () => {
    expect(stringSimilarity("BOHEMIAN RHAPSODY", "bohemian rhapsody")).toBe(1.0);
  });

  it("should return 1.0 for strings that differ only in whitespace", () => {
    expect(stringSimilarity("  hello  ", "hello")).toBe(1.0);
  });

  it("should return 0.0 for empty vs non-empty", () => {
    expect(stringSimilarity("", "hello")).toBe(0.0);
    expect(stringSimilarity("hello", "")).toBe(0.0);
  });

  it("should return 0.0 for both empty", () => {
    expect(stringSimilarity("", "")).toBe(1.0);
  });

  it("should return high similarity for similar strings", () => {
    const sim = stringSimilarity("Bohemian Rhapsody", "Bohemian Rhapsody (Remastered)");
    expect(sim).toBeGreaterThan(0.7);
  });

  it("should return low similarity for very different strings", () => {
    const sim = stringSimilarity("Bohemian Rhapsody", "Yesterday");
    expect(sim).toBeLessThan(0.3);
  });

  it("should be symmetric", () => {
    const ab = stringSimilarity("Queen", "Queenie");
    const ba = stringSimilarity("Queenie", "Queen");
    expect(ab).toBe(ba);
  });

  it("should handle single character strings", () => {
    // Single char has 0 bigrams -> size 0 -> division by zero guard
    const sim = stringSimilarity("a", "a");
    expect(sim).toBe(1.0);
  });
});

// =============================================================================
// isDurationMatch
// =============================================================================

describe("isDurationMatch", () => {
  it("should match identical durations", () => {
    expect(isDurationMatch(240000, 240000)).toBe(true);
  });

  it("should match within 3 second tolerance", () => {
    expect(isDurationMatch(240000, 243000)).toBe(true);
    expect(isDurationMatch(243000, 240000)).toBe(true);
  });

  it("should not match beyond 3 second tolerance", () => {
    expect(isDurationMatch(240000, 243001)).toBe(false);
  });

  it("should match at exact boundary (3000ms diff)", () => {
    expect(isDurationMatch(100000, 103000)).toBe(true);
  });
});

// =============================================================================
// calculateConfidence
// =============================================================================

describe("calculateConfidence", () => {
  it("should return 1.0 for matching ISRC codes", () => {
    const score = calculateConfidence(
      { title: "Bohemian Rhapsody", artists: ["Queen"], isrc: "GBUM71029604" },
      { title: "Bohemian Rhapsody", artists: ["Queen"], isrc: "GBUM71029604" },
    );
    expect(score).toBe(1.0);
  });

  it("should not use ISRC shortcut when ISRCs differ", () => {
    const score = calculateConfidence(
      { title: "Bohemian Rhapsody", artists: ["Queen"], isrc: "GBUM71029604" },
      { title: "Bohemian Rhapsody", artists: ["Queen"], isrc: "DIFFERENT123" },
    );
    expect(score).toBeLessThan(1.0);
    expect(score).toBeGreaterThan(0.7);
  });

  it("should return high score for identical title and artist", () => {
    const score = calculateConfidence(
      { title: "Bohemian Rhapsody", artists: ["Queen"] },
      { title: "Bohemian Rhapsody", artists: ["Queen"] },
    );
    // title: 1.0 * 0.4 = 0.4, artists: 1.0 * 0.4 = 0.4, total = 0.8
    expect(score).toBe(0.8);
  });

  it("should add duration bonus when within 3 seconds", () => {
    const score = calculateConfidence(
      { title: "Bohemian Rhapsody", artists: ["Queen"], durationMs: 354000 },
      { title: "Bohemian Rhapsody", artists: ["Queen"], durationMs: 355000 },
    );
    // title: 0.4, artists: 0.4, duration: 0.2 = 1.0
    expect(score).toBe(1.0);
  });

  it("should add partial duration bonus when within 10 seconds", () => {
    const score = calculateConfidence(
      { title: "Bohemian Rhapsody", artists: ["Queen"], durationMs: 354000 },
      { title: "Bohemian Rhapsody", artists: ["Queen"], durationMs: 360000 },
    );
    // title: 0.4, artists: 0.4, duration: 0.1 = 0.9
    expect(score).toBe(0.9);
  });

  it("should not add duration bonus when beyond 10 seconds", () => {
    const score = calculateConfidence(
      { title: "Bohemian Rhapsody", artists: ["Queen"], durationMs: 354000 },
      { title: "Bohemian Rhapsody", artists: ["Queen"], durationMs: 370000 },
    );
    // title: 0.4, artists: 0.4, duration: 0 = 0.8
    expect(score).toBe(0.8);
  });

  it("should handle multi-artist comparison correctly", () => {
    const score = calculateConfidence(
      { title: "Work", artists: ["Rihanna", "Drake"] },
      { title: "Work", artists: ["Drake", "Rihanna"] },
    );
    // Title: 1.0 * 0.4 = 0.4
    // Artists: Rihanna->Rihanna=1.0, Drake->Drake=1.0, avg=1.0 * 0.4 = 0.4
    expect(score).toBe(0.8);
  });

  it("should handle artist subset matching", () => {
    const score = calculateConfidence(
      { title: "Work", artists: ["Rihanna", "Drake"] },
      { title: "Work", artists: ["Rihanna"] },
    );
    // Title: 1.0 * 0.4 = 0.4
    // Artists: Rihanna->Rihanna=1.0, Drake->Rihanna=low, avg * 0.4
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(0.8);
  });

  it("should return low score for completely different tracks", () => {
    const score = calculateConfidence(
      { title: "Bohemian Rhapsody", artists: ["Queen"] },
      { title: "Yesterday", artists: ["The Beatles"] },
    );
    expect(score).toBeLessThan(0.3);
  });

  it("should handle empty artist arrays gracefully", () => {
    const score = calculateConfidence(
      { title: "Bohemian Rhapsody", artists: [] },
      { title: "Bohemian Rhapsody", artists: ["Queen"] },
    );
    // Only title contributes: 1.0 * 0.4 = 0.4
    expect(score).toBeCloseTo(0.4, 1);
  });

  it("should handle both empty artist arrays", () => {
    const score = calculateConfidence(
      { title: "Bohemian Rhapsody", artists: [] },
      { title: "Bohemian Rhapsody", artists: [] },
    );
    expect(score).toBeCloseTo(0.4, 1);
  });
});
