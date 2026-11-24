/**
 * @file Guards which preview the album resolve response carries.
 *
 * The share page reads an album's preview through `previewPreferenceOrder`,
 * which prefers Deezer. The resolve response has to pick the same one, or the
 * resolve and the share page play different clips for the same album.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistAlbumData } from "../db/repository.js";

/** Unix seconds of 2100-01-01, far ahead, so the signed Deezer URL is usable. */
const VALID_TOKEN_SECONDS = 4102444800;
const SOURCE_PREVIEW_URL = "https://p.scdn.co/mp3-preview/source-clip";
const DEEZER_PREVIEW_URL = `https://cdnt-preview.dzcdn.net/api/1/1/clip.mp3?hdnea=exp=${VALID_TOKEN_SECONDS}~hmac=valid`;

const repository = {
  persistAlbumWithLinks: vi.fn(async (_data: PersistAlbumData) => ({
    albumId: "album-id",
    shortId: "album-short",
    artistCredits: [],
  })),
  readVinylLayout: vi.fn(async () => null),
  upsertAlbumPreview: vi.fn(async () => undefined),
  addAlbumExternalIds: vi.fn(async () => undefined),
};
vi.mock("../db/index.js", () => ({ getRepository: async () => repository }));
const { persistAlbumAndRespond } = await import("../services/resolve-response.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("persistAlbumAndRespond", () => {
  it("carries the Deezer link's preview over the source service's preview", async () => {
    const response = await persistAlbumAndRespond(
      {
        sourceAlbum: {
          sourceService: "spotify",
          sourceId: "spotify-album",
          title: "Hunting High and Low",
          artists: ["a-ha"],
          webUrl: "https://open.spotify.com/album/spotify-album",
          topTrackPreviewUrl: SOURCE_PREVIEW_URL,
        },
        links: [
          {
            service: "deezer",
            displayName: "Deezer",
            url: "https://www.deezer.com/album/302127",
            confidence: 1,
            matchMethod: "upc",
            topTrackPreviewUrl: DEEZER_PREVIEW_URL,
          },
        ],
        externalIds: [],
      },
      "https://musiccloud.test",
    );

    expect(response.type).toBe("album");
    expect(response.type === "album" && response.album.previewUrl).toBe(DEEZER_PREVIEW_URL);
    expect(repository.persistAlbumWithLinks.mock.calls[0][0].sourceAlbum.previewUrl).toBe(DEEZER_PREVIEW_URL);
    expect(repository.upsertAlbumPreview).toHaveBeenCalledWith("album-id", {
      service: "deezer",
      url: DEEZER_PREVIEW_URL,
      expiresAt: new Date(VALID_TOKEN_SECONDS * 1000),
    });
  });
});
