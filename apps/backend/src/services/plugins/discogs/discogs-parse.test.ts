import { describe, expect, it } from "vitest";
import { parseDiscogsDuration, sideLabelFromPosition } from "./discogs-parse";

// =============================================================================
// parseDiscogsDuration
// =============================================================================

describe("parseDiscogsDuration", () => {
  it('parses "3:32" to 212000 ms', () => {
    expect(parseDiscogsDuration("3:32")).toBe(212000);
  });

  it('parses "11:54" to 714000 ms', () => {
    expect(parseDiscogsDuration("11:54")).toBe(714000);
  });

  it('parses "20:10" to 1210000 ms', () => {
    expect(parseDiscogsDuration("20:10")).toBe(1210000);
  });

  it("returns null for empty string", () => {
    expect(parseDiscogsDuration("")).toBeNull();
  });

  it('returns null for unparseable input "abc"', () => {
    expect(parseDiscogsDuration("abc")).toBeNull();
  });
});

// =============================================================================
// sideLabelFromPosition
// =============================================================================

describe("sideLabelFromPosition", () => {
  it('extracts "A" from "A"', () => {
    expect(sideLabelFromPosition("A")).toBe("A");
  });

  it('extracts "B" from "B2"', () => {
    expect(sideLabelFromPosition("B2")).toBe("B");
  });

  it('extracts "C" from "C1"', () => {
    expect(sideLabelFromPosition("C1")).toBe("C");
  });

  it("returns null for empty string", () => {
    expect(sideLabelFromPosition("")).toBeNull();
  });

  it('returns null for numeric-only position "3"', () => {
    expect(sideLabelFromPosition("3")).toBeNull();
  });
});
