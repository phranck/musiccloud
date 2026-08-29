import type { VinylLayout } from "@musiccloud/shared";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { upsertVinylLayout } from "../../../db/adapters/postgres-albums.js";
import { insertExternalIds } from "../../../db/adapters/postgres-shared.js";
import { getMasterVinylVersions, getRelease, isDiscogsConfigured, searchVinylMaster } from "./discogs-client.js";

vi.mock("./discogs-client.js", () => ({
  getMasterVinylVersions: vi.fn(),
  getRelease: vi.fn(),
  isDiscogsConfigured: vi.fn(),
  searchVinylMaster: vi.fn(),
}));

vi.mock("../../../db/adapters/postgres-albums.js", () => ({
  upsertVinylLayout: vi.fn(),
}));

vi.mock("../../../db/adapters/postgres-shared.js", () => ({
  insertExternalIds: vi.fn(),
}));

import { enrichVinylLayout } from "./discogs-enrich.js";

const clientMocks = {
  getMasterVinylVersions: vi.mocked(getMasterVinylVersions),
  getRelease: vi.mocked(getRelease),
  isDiscogsConfigured: vi.mocked(isDiscogsConfigured),
  searchVinylMaster: vi.mocked(searchVinylMaster),
};

const persistenceMocks = {
  insertExternalIds: vi.mocked(insertExternalIds),
  upsertVinylLayout: vi.mocked(upsertVinylLayout),
};

const pool = {} as Pool;
const album = {
  identityKey: "jimmy smith::the sermon",
  albumId: "album-123",
  title: "The Sermon!",
  artists: ["Jimmy Smith"],
  upc: "123456789012",
};

const completeLayout: VinylLayout = {
  discogsReleaseId: "15815903",
  sides: [
    {
      label: "A",
      tracks: [{ position: "A", title: "The Sermon", durationMs: 1210000 }],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DISCOGS_TOKEN = "test-token";
  clientMocks.isDiscogsConfigured.mockImplementation(() => Boolean(process.env.DISCOGS_TOKEN));
});

afterEach(() => {
  delete process.env.DISCOGS_TOKEN;
});

describe("enrichVinylLayout", () => {
  it("persists a complete vinyl layout and its Discogs release provenance", async () => {
    clientMocks.searchVinylMaster.mockResolvedValue(33100);
    clientMocks.getMasterVinylVersions.mockResolvedValue([{ id: 15815903, released: "1959", format: "LP, Album" }]);
    clientMocks.getRelease.mockResolvedValue({
      id: 15815903,
      tracklist: [{ position: "A", type_: "track", title: "The Sermon", duration: "20:10" }],
    });

    await enrichVinylLayout(pool, album);

    expect(clientMocks.searchVinylMaster).toHaveBeenCalledWith({ artist: "Jimmy Smith", title: "The Sermon!" });
    expect(persistenceMocks.upsertVinylLayout).toHaveBeenCalledWith(pool, album.identityKey, completeLayout);
    expect(persistenceMocks.insertExternalIds).toHaveBeenCalledWith(
      pool,
      "album_external_ids",
      "album_id",
      album.albumId,
      [{ idType: "discogs_release", idValue: "15815903", sourceService: "discogs" }],
    );
  });

  it("persists a negative cache when no original vinyl version exists", async () => {
    clientMocks.searchVinylMaster.mockResolvedValue(33100);
    clientMocks.getMasterVinylVersions.mockResolvedValue([]);

    await enrichVinylLayout(pool, album);

    expect(persistenceMocks.upsertVinylLayout).toHaveBeenCalledWith(pool, album.identityKey, null);
    expect(clientMocks.getRelease).not.toHaveBeenCalled();
    expect(persistenceMocks.insertExternalIds).not.toHaveBeenCalled();
  });

  it("does not cache a release with incomplete track durations", async () => {
    clientMocks.searchVinylMaster.mockResolvedValue(33100);
    clientMocks.getMasterVinylVersions.mockResolvedValue([{ id: 15815903, released: "1959", format: "LP, Album" }]);
    clientMocks.getRelease.mockResolvedValue({
      id: 15815903,
      tracklist: [{ position: "A", type_: "track", title: "The Sermon", duration: "" }],
    });

    await enrichVinylLayout(pool, album);

    expect(persistenceMocks.upsertVinylLayout).not.toHaveBeenCalled();
    expect(persistenceMocks.insertExternalIds).not.toHaveBeenCalled();
  });

  it("does not persist a layout when writing its Discogs provenance fails", async () => {
    clientMocks.searchVinylMaster.mockResolvedValue(33100);
    clientMocks.getMasterVinylVersions.mockResolvedValue([{ id: 15815903, released: "1959", format: "LP, Album" }]);
    clientMocks.getRelease.mockResolvedValue({
      id: 15815903,
      tracklist: [{ position: "A", type_: "track", title: "The Sermon", duration: "20:10" }],
    });
    persistenceMocks.insertExternalIds.mockRejectedValue(new Error("database unavailable"));

    await enrichVinylLayout(pool, album);

    expect(persistenceMocks.upsertVinylLayout).not.toHaveBeenCalled();
  });

  it("does not persist when the Discogs client fails transiently", async () => {
    clientMocks.searchVinylMaster.mockRejectedValue(new Error("rate limited"));

    await enrichVinylLayout(pool, album);

    expect(persistenceMocks.upsertVinylLayout).not.toHaveBeenCalled();
    expect(persistenceMocks.insertExternalIds).not.toHaveBeenCalled();
  });

  it("does nothing when DISCOGS_TOKEN is absent", async () => {
    delete process.env.DISCOGS_TOKEN;

    await enrichVinylLayout(pool, album);

    expect(clientMocks.searchVinylMaster).not.toHaveBeenCalled();
    expect(persistenceMocks.upsertVinylLayout).not.toHaveBeenCalled();
    expect(persistenceMocks.insertExternalIds).not.toHaveBeenCalled();
  });
});
