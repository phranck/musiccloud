import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The album share loader reads one row from the repository. A row stored before
// album writes normalized its date can still hold a raw value, and the share
// response schema validates `releaseDate` as `format: date`, so the loader
// reads it through the same normalizer as every other path.
const loadAlbumByShortId = vi.fn();
const loadByShortId = vi.fn();
const loadByTrackId = vi.fn();
const loadArtistByShortId = vi.fn();
const replaceRecordingArtwork = vi.fn();
const network = vi.fn();
vi.mock("../../../db/index.js", () => ({
  getRepository: async () => ({
    loadAlbumByShortId,
    loadByShortId,
    loadByTrackId,
    loadArtistByShortId,
    replaceRecordingArtwork,
  }),
}));

const {
  loadAlbumByShortId: loadAlbumSharePage,
  loadByShortId: loadTrackSharePage,
  loadByTrackId: loadTrackShareById,
  loadArtistByShortId: loadArtistSharePage,
} = await import("../share-page.js");
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("loadAlbumByShortId opened through an alias", () => {
  beforeEach(() => loadAlbumByShortId.mockReset());

  it("reports the canonical short URL the repository resolved to", async () => {
    loadAlbumByShortId.mockResolvedValue(albumRow(null));

    const page = await loadAlbumSharePage("alias-of-abc12", "https://musiccloud.io");

    expect(page?.shortId).toBe("abc12");
    expect(page?.og.ogUrl).toBe("https://musiccloud.io/abc12");
  });
});

describe("read-only stored recording artwork", () => {
  const video = "https://i.ytimg.com/vi/ImX2w6Ufj4w/maxresdefault.jpg";

  it.each([
    loadTrackSharePage,
    loadTrackShareById,
  ])("filters a stored video cover without upstream calls or writes", async (load) => {
    const stored = {
      trackId: "track-1",
      shortId: "existing-share",
      artists: ["DARKK"],
      artistCredits: [],
      artistDisplay: "DARKK",
      links: [],
      track: {
        title: "Hurt People",
        albumName: null,
        artworkUrl: video,
        durationMs: 200000,
        isrc: null,
        releaseDate: null,
        isExplicit: null,
        previewUrl: null,
      },
    };
    loadByShortId.mockResolvedValue(structuredClone(stored));
    loadByTrackId.mockResolvedValue(structuredClone(stored));

    const page = await load("existing-share", "https://musiccloud.io");

    expect(page?.track.artworkUrl).toBeNull();
    expect(page?.og.ogImageUrl).toBe("https://musiccloud.io/og/default.jpg");
    expect(replaceRecordingArtwork).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("filters a stored album video cover using the same read-only policy", async () => {
    loadAlbumByShortId.mockResolvedValue({ ...albumRow(null), album: { ...albumRow(null).album, artworkUrl: video } });
    const page = await loadAlbumSharePage("abc12", "https://musiccloud.io");
    expect(page?.album.artworkUrl).toBeNull();
    expect(page?.og.ogImageUrl).toBe("https://musiccloud.io/og/default.jpg");
    expect(replaceRecordingArtwork).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("retains YouTube channel portraits on artist shares", async () => {
    const portrait = "https://yt3.ggpht.com/portrait";
    loadArtistByShortId.mockResolvedValue({
      artist: { name: "DARKK", imageUrl: portrait, genres: [] },
      shortId: "artist-share",
      links: [],
    });
    const page = await loadArtistSharePage("artist-share", "https://musiccloud.io");
    expect(page?.artist.imageUrl).toBe(portrait);
  });
});

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
