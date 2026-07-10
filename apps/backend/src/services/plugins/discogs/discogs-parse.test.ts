import { describe, expect, it } from "vitest";
import type { DiscogsMasterVersion } from "./discogs-parse";
import { parseDiscogsDuration, selectOriginalVinylVersion, sideLabelFromPosition } from "./discogs-parse";

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

// =============================================================================
// selectOriginalVinylVersion
// =============================================================================

describe("selectOriginalVinylVersion", () => {
  // Fixture modelled on Discogs Master 33100 (Jimmy Smith — The Sermon!)
  const master33100: DiscogsMasterVersion[] = [
    { id: 1600967, released: "1959", format: "LP, Album, Stereo" },
    { id: 15815903, released: "1959", format: "LP, Album, Mono" },
    { id: 1241428, released: "1960", format: "LP, Album, Reissue, Mono" },
  ];

  it("returns the first 1959 non-reissue version from the Master 33100 fixture", () => {
    const result = selectOriginalVinylVersion(master33100);
    expect(result?.id).toBe(1600967);
  });

  it("returns null for an empty versions array", () => {
    expect(selectOriginalVinylVersion([])).toBeNull();
  });

  it("returns null when all versions are reissues", () => {
    const onlyReissue: DiscogsMasterVersion[] = [{ id: 1, released: "1960", format: "LP, Album, Reissue" }];
    expect(selectOriginalVinylVersion(onlyReissue)).toBeNull();
  });

  it("returns null when no version has a Vinyl or LP format", () => {
    const cdOnly: DiscogsMasterVersion[] = [{ id: 2, released: "1959", format: "CD, Album" }];
    expect(selectOriginalVinylVersion(cdOnly)).toBeNull();
  });

  it("ignores non-vinyl formats even when they have an earlier year", () => {
    const mixed: DiscogsMasterVersion[] = [
      { id: 10, released: "1958", format: "CD, Album" },
      { id: 11, released: "1959", format: "LP, Album" },
    ];
    const result = selectOriginalVinylVersion(mixed);
    expect(result?.id).toBe(11);
  });
});
