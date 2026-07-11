import { describe, expect, it } from "vitest";
import type { DiscogsMasterVersion, DiscogsRelease } from "./discogs-parse";
import {
  normalizeReleaseToLayout,
  parseDiscogsDuration,
  selectOriginalVinylVersion,
  sideLabelFromPosition,
} from "./discogs-parse";

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

  it("returns null for zero-length and out-of-range seconds", () => {
    expect(parseDiscogsDuration("0:00")).toBeNull();
    expect(parseDiscogsDuration("3:60")).toBeNull();
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

// =============================================================================
// normalizeReleaseToLayout
// =============================================================================

describe("normalizeReleaseToLayout", () => {
  // Fixture modelled on Discogs release 15815903 (Jimmy Smith — The Sermon!)
  const sermon: DiscogsRelease = {
    id: 15815903,
    tracklist: [
      { position: "A", type_: "track", title: "The Sermon", duration: "20:10" },
      { position: "B1", type_: "track", title: "J.O.S.", duration: "11:54" },
      { position: "B2", type_: "track", title: "Flamingo", duration: "8:00" },
    ],
  };

  it("returns the correct VinylLayout for the The Sermon! fixture", () => {
    const result = normalizeReleaseToLayout(sermon);
    expect(result).toEqual({
      discogsReleaseId: "15815903",
      sides: [
        {
          label: "A",
          tracks: [{ position: "A", title: "The Sermon", durationMs: 1210000 }],
        },
        {
          label: "B",
          tracks: [
            { position: "B1", title: "J.O.S.", durationMs: 714000 },
            { position: "B2", title: "Flamingo", durationMs: 480000 },
          ],
        },
      ],
    });
  });

  it("returns null when any track has an empty duration", () => {
    const release: DiscogsRelease = {
      id: 99,
      tracklist: [
        { position: "A", type_: "track", title: "Track One", duration: "" },
        { position: "B1", type_: "track", title: "Track Two", duration: "3:00" },
      ],
    };
    expect(normalizeReleaseToLayout(release)).toBeNull();
  });

  it("returns null when the release has no real tracks", () => {
    expect(normalizeReleaseToLayout({ id: 100, tracklist: [] })).toBeNull();
  });

  it("ignores non-track entries (headings) and builds layout from real tracks only", () => {
    const release: DiscogsRelease = {
      id: 42,
      tracklist: [
        { position: "", type_: "heading", title: "Side One", duration: "" },
        { position: "A", type_: "track", title: "Real Track", duration: "5:00" },
      ],
    };
    const result = normalizeReleaseToLayout(release);
    expect(result).toEqual({
      discogsReleaseId: "42",
      sides: [
        {
          label: "A",
          tracks: [{ position: "A", title: "Real Track", durationMs: 300000 }],
        },
      ],
    });
  });

  it("returns null when a heading with empty duration is mixed in but the only real track also lacks a duration", () => {
    const release: DiscogsRelease = {
      id: 77,
      tracklist: [
        { position: "", type_: "heading", title: "Side A", duration: "" },
        { position: "A", type_: "track", title: "Bad Track", duration: "" },
      ],
    };
    expect(normalizeReleaseToLayout(release)).toBeNull();
  });
});
