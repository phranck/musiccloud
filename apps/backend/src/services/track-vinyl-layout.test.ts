import type { VinylLayout } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";
import { resolveTrackVinylLayout } from "./track-vinyl-layout.js";

const layout: VinylLayout = {
  discogsReleaseId: "10013707",
  sides: [{ label: "A", tracks: [{ position: "A1", title: "The Sermon!", durationMs: 1_210_000 }] }],
};

function createRepository() {
  return {
    findAlbumByVinylLayoutIdentity: vi.fn(),
    ensureAlbumVinylLayoutIdentity: vi.fn(),
    createAlbumVinylLayoutPlaceholder: vi.fn(),
    deleteAlbumVinylLayoutPlaceholder: vi.fn(),
    enrichAlbumVinylLayout: vi.fn(),
    readAlbumVinylLayout: vi.fn(),
  };
}

describe("resolveTrackVinylLayout", () => {
  it("returns an existing identity cache without a Discogs request", async () => {
    const repo = createRepository();
    repo.findAlbumByVinylLayoutIdentity.mockResolvedValue({ albumId: "album-1" });
    repo.readAlbumVinylLayout.mockResolvedValue(layout);

    await expect(
      resolveTrackVinylLayout(repo, { artists: ["Jimmy Smith"], albumName: "The Sermon!" }),
    ).resolves.toEqual(layout);

    expect(repo.enrichAlbumVinylLayout).not.toHaveBeenCalled();
    expect(repo.createAlbumVinylLayoutPlaceholder).not.toHaveBeenCalled();
  });

  it("claims the artist-qualified album identity before enriching a cache miss", async () => {
    const repo = createRepository();
    repo.findAlbumByVinylLayoutIdentity.mockResolvedValue(null);
    repo.createAlbumVinylLayoutPlaceholder.mockResolvedValue("album-1");
    repo.ensureAlbumVinylLayoutIdentity.mockResolvedValue("album-1");
    repo.readAlbumVinylLayout.mockResolvedValueOnce(undefined).mockResolvedValueOnce(layout);

    await expect(
      resolveTrackVinylLayout(repo, { artists: ["Jimmy Smith"], albumName: "The Sermon!" }),
    ).resolves.toEqual(layout);

    expect(repo.createAlbumVinylLayoutPlaceholder).toHaveBeenCalledWith("The Sermon!");
    expect(repo.enrichAlbumVinylLayout).toHaveBeenCalledWith({
      id: "album-1",
      title: "The Sermon!",
      artists: ["Jimmy Smith"],
    });
  });

  it("never uses a title-only lookup when the primary artist is absent", async () => {
    const repo = createRepository();

    await expect(resolveTrackVinylLayout(repo, { artists: [], albumName: "The Sermon!" })).resolves.toBeNull();

    expect(repo.findAlbumByVinylLayoutIdentity).not.toHaveBeenCalled();
    expect(repo.createAlbumVinylLayoutPlaceholder).not.toHaveBeenCalled();
  });

  it("removes a concurrently losing placeholder after another resolve claims the identity", async () => {
    const repo = createRepository();
    repo.findAlbumByVinylLayoutIdentity.mockResolvedValue(null);
    repo.createAlbumVinylLayoutPlaceholder.mockResolvedValue("losing-placeholder");
    repo.ensureAlbumVinylLayoutIdentity.mockResolvedValue("winning-placeholder");
    repo.readAlbumVinylLayout.mockResolvedValue(layout);

    await expect(
      resolveTrackVinylLayout(repo, { artists: ["Jimmy Smith"], albumName: "The Sermon!" }),
    ).resolves.toEqual(layout);

    expect(repo.deleteAlbumVinylLayoutPlaceholder).toHaveBeenCalledWith("losing-placeholder");
    expect(repo.enrichAlbumVinylLayout).not.toHaveBeenCalled();
  });

  it("removes an unclaimed placeholder when the identity claim fails", async () => {
    const repo = createRepository();
    repo.findAlbumByVinylLayoutIdentity.mockResolvedValue(null);
    repo.createAlbumVinylLayoutPlaceholder.mockResolvedValue("unclaimed-placeholder");
    repo.ensureAlbumVinylLayoutIdentity.mockRejectedValue(new Error("database unavailable"));

    await expect(
      resolveTrackVinylLayout(repo, { artists: ["Jimmy Smith"], albumName: "The Sermon!" }),
    ).resolves.toBeNull();

    expect(repo.deleteAlbumVinylLayoutPlaceholder).toHaveBeenCalledWith("unclaimed-placeholder");
  });
});
