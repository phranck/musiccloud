import { beforeEach, describe, expect, it, vi } from "vitest";

// The album share loader reads one row from the repository. A row stored before
// album writes normalized its date can still hold a raw value, and the share
// response schema validates `releaseDate` as `format: date`, so the loader
// reads it through the same normalizer as every other path.
const loadAlbumByShortId = vi.fn();
vi.mock("../../../db/index.js", () => ({
  getRepository: async () => ({ loadAlbumByShortId }),
}));

const { loadAlbumByShortId: loadAlbumSharePage } = await import("../share-page.js");

/** An album share row whose release date is the one thing that varies. */
function albumRow(releaseDate: string | null) {
  return {
    albumId: "album-1",
    album: {
      title: "Fixture",
      artworkUrl: null,
      releaseDate,
      totalTracks: 10,
      label: null,
      upc: null,
      previewUrl: null,
      vinylLayout: null,
    },
    artists: ["Someone"],
    artistCredits: [],
    artistDisplay: "Someone",
    shortId: "abc12",
    links: [],
  };
}

describe("loadAlbumByShortId release date", () => {
  beforeEach(() => loadAlbumByShortId.mockReset());

  it.each([
    ["an impossible calendar date", "2009-02-31", null],
    ["an RFC-2822 date", "15 Sep 2025 00:00:00 GMT", "2025-09-15"],
    ["an ISO timestamp", "2009-10-07T23:12:34Z", "2009-10-07"],
    ["a year and month", "1975-11", null],
  ])("reads %s the way the resolve response does", async (_label, stored, expected) => {
    loadAlbumByShortId.mockResolvedValue(albumRow(stored));

    const page = await loadAlbumSharePage("abc12", "https://musiccloud.io");

    expect(page?.album.releaseDate).toBe(expected);
  });
});
