import type { VinylLayout } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";
import { readCachedAlbumVinylLayout, resolveAlbumVinylLayout, resolveTrackVinylLayout } from "./track-vinyl-layout.js";

const layout: VinylLayout = {
  discogsReleaseId: "10013707",
  sides: [{ label: "A", tracks: [{ position: "A1", title: "The Sermon!", durationMs: 1_210_000 }] }],
};

function createRepository() {
  return {
    readVinylLayout: vi.fn(),
    enrichVinylLayout: vi.fn(),
  };
}

describe("resolveTrackVinylLayout", () => {
  it("returns a cached layout without a Discogs request", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValue(layout);

    await expect(
      resolveTrackVinylLayout(repo, { artists: ["Jimmy Smith"], albumName: "The Sermon!" }),
    ).resolves.toEqual(layout);

    expect(repo.enrichVinylLayout).not.toHaveBeenCalled();
  });

  /**
   * A stored `null` means Discogs was already asked and holds no vinyl
   * pressing. Asking again on every resolve is what the negative cache exists
   * to prevent.
   */
  it("respects a negative cache instead of asking Discogs again", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValue(null);

    await expect(
      resolveTrackVinylLayout(repo, { artists: ["Jimmy Smith"], albumName: "The Sermon!" }),
    ).resolves.toBeNull();

    expect(repo.enrichVinylLayout).not.toHaveBeenCalled();
  });

  it("enriches an identity that has never been checked", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValueOnce(undefined).mockResolvedValueOnce(layout);

    await expect(
      resolveTrackVinylLayout(repo, { artists: ["Jimmy Smith"], albumName: "The Sermon!" }),
    ).resolves.toEqual(layout);

    expect(repo.enrichVinylLayout).toHaveBeenCalledWith({
      identityKey: "jimmy smith::the sermon",
      title: "The Sermon!",
      artists: ["Jimmy Smith"],
      albumId: undefined,
    });
  });

  it("never uses a title-only lookup when the primary artist is absent", async () => {
    const repo = createRepository();

    await expect(resolveTrackVinylLayout(repo, { artists: [], albumName: "The Sermon!" })).resolves.toBeNull();

    expect(repo.readVinylLayout).not.toHaveBeenCalled();
    expect(repo.enrichVinylLayout).not.toHaveBeenCalled();
  });

  it("returns null when the track carries no album name", async () => {
    const repo = createRepository();

    await expect(resolveTrackVinylLayout(repo, { artists: ["Jimmy Smith"] })).resolves.toBeNull();

    expect(repo.readVinylLayout).not.toHaveBeenCalled();
  });

  it("keeps a failure non-fatal for the resolve", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockRejectedValue(new Error("database unavailable"));

    await expect(
      resolveTrackVinylLayout(repo, { artists: ["Jimmy Smith"], albumName: "The Sermon!" }),
    ).resolves.toBeNull();
  });
});

describe("resolveAlbumVinylLayout", () => {
  /**
   * A share open reaches this function on every request, so a stored layout has
   * to answer without touching Discogs. Enriching on a hit would put an upstream
   * round-trip on the read path of every Creative Commons share page.
   */
  it("answers from the stored layout without enriching", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValue(layout);

    await expect(resolveAlbumVinylLayout(repo, { artists: ["Jimmy Smith"], title: "The Sermon!" })).resolves.toEqual(
      layout,
    );

    expect(repo.enrichVinylLayout).not.toHaveBeenCalled();
    expect(repo.readVinylLayout).toHaveBeenCalledTimes(1);
  });

  it("shares the identity cache and enrichment flow with track resolves", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValueOnce(undefined).mockResolvedValueOnce(layout);

    await expect(resolveAlbumVinylLayout(repo, { artists: ["Jimmy Smith"], title: "The Sermon!" })).resolves.toEqual(
      layout,
    );

    expect(repo.enrichVinylLayout).toHaveBeenCalledWith({
      identityKey: "jimmy smith::the sermon",
      title: "The Sermon!",
      artists: ["Jimmy Smith"],
      albumId: undefined,
    });
  });

  /**
   * The layout belongs to the identity, but the Discogs release id is recorded
   * against a catalogue album where one exists, so the album has to reach the
   * enrichment step.
   */
  it("passes the catalogue album through when the caller has one", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValueOnce(undefined).mockResolvedValueOnce(layout);

    await resolveAlbumVinylLayout(repo, {
      artists: ["Jimmy Smith"],
      title: "The Sermon!",
      albumId: "album-1",
    });

    expect(repo.enrichVinylLayout).toHaveBeenCalledWith(expect.objectContaining({ albumId: "album-1" }));
  });
});

describe("readCachedAlbumVinylLayout", () => {
  it("reads an existing layout without enriching", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValue(layout);

    await expect(readCachedAlbumVinylLayout(repo, { artists: ["Jimmy Smith"], title: "The Sermon!" })).resolves.toEqual(
      layout,
    );

    expect(repo.enrichVinylLayout).not.toHaveBeenCalled();
  });

  it("reports an unchecked identity as no layout rather than as an error", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValue(undefined);

    await expect(
      readCachedAlbumVinylLayout(repo, { artists: ["Jimmy Smith"], title: "The Sermon!" }),
    ).resolves.toBeNull();
  });
});
