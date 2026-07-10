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
    persistAlbumWithLinks: vi.fn(),
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
    expect(repo.persistAlbumWithLinks).not.toHaveBeenCalled();
  });

  it("persists the artist-qualified album identity before enriching a cache miss", async () => {
    const repo = createRepository();
    repo.findAlbumByVinylLayoutIdentity.mockResolvedValue(null);
    repo.persistAlbumWithLinks.mockResolvedValue({ albumId: "album-1" });
    repo.ensureAlbumVinylLayoutIdentity.mockResolvedValue("album-1");
    repo.readAlbumVinylLayout.mockResolvedValueOnce(undefined).mockResolvedValueOnce(layout);

    await expect(
      resolveTrackVinylLayout(repo, { artists: ["Jimmy Smith"], albumName: "The Sermon!" }),
    ).resolves.toEqual(layout);

    expect(repo.persistAlbumWithLinks).toHaveBeenCalledWith({
      sourceAlbum: { title: "The Sermon!", artists: ["Jimmy Smith"] },
      links: [],
    });
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
    expect(repo.persistAlbumWithLinks).not.toHaveBeenCalled();
  });
});
