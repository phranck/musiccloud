import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistAlbumData, SharePageAlbumResult } from "../db/repository.js";

const operatorCover = "https://example.test/operator-cover.jpg";
const stored: SharePageAlbumResult = {
  albumId: "album-id",
  shortId: "existing-album",
  artists: ["DARKK"],
  artistCredits: [],
  artistDisplay: "DARKK",
  links: [],
  album: {
    title: "Hurt People",
    artworkUrl: operatorCover,
    releaseDate: null,
    totalTracks: null,
    label: null,
    upc: null,
    previewUrl: null,
    vinylLayout: null,
  },
};
const repository = {
  persistAlbumWithLinks: vi.fn(async (data: PersistAlbumData) => {
    stored.album.artworkUrl = data.sourceAlbum.artworkUrl ?? null;
    return { albumId: stored.albumId, shortId: stored.shortId, artistCredits: [] };
  }),
  loadAlbumByShortId: vi.fn(async () => structuredClone(stored)),
  readVinylLayout: vi.fn(async () => null),
  upsertAlbumPreview: vi.fn(),
  addAlbumExternalIds: vi.fn(),
};
vi.mock("../db/index.js", () => ({ getRepository: async () => repository }));
const { persistAlbumAndRespond } = await import("../services/resolve-response.js");
const { loadAlbumByShortId } = await import("../lib/server/share-page.js");

beforeEach(() => {
  stored.album.artworkUrl = operatorCover;
});

describe("cached album response ownership", () => {
  it("keeps a concurrent operator cover instead of rewriting a cached snapshot", async () => {
    await persistAlbumAndRespond(
      {
        albumId: "album-id",
        shortId: "existing-album",
        links: [],
        externalIds: [],
        sourceAlbum: {
          sourceService: "cached",
          sourceId: "album-id",
          title: "Hurt People",
          artists: ["DARKK"],
          artworkUrl: "https://example.test/earlier-cover.jpg",
          webUrl: "https://www.deezer.com/album/1074806782",
        },
      },
      "https://example.test",
    );

    const page = await loadAlbumByShortId("existing-album", "https://example.test");

    expect(page?.album.artworkUrl).toBe(operatorCover);
    expect(page?.shortId).toBe("existing-album");
  });
});
