import { beforeEach, describe, expect, it, vi } from "vitest";

const { debugMock } = vi.hoisted(() => ({ debugMock: vi.fn() }));

vi.mock("../lib/infra/logger.js", () => ({
  log: { debug: debugMock, error: vi.fn(), deviation: vi.fn() },
}));

import { saveExternalIdsLogged } from "../services/external-ids";
import type { ExternalIdRecord } from "../services/types";

/** One collected record, as the collectors produce them. */
const RECORD: ExternalIdRecord = { idType: "isrc", idValue: "USUM71703861", sourceService: "spotify" };
/** The message the caller passes for a failed write. */
const FAILURE_MESSAGE = "External-id persist failed:";

/** Builds a repository whose three external-id writes are spies. */
function makeRepo() {
  return {
    addTrackExternalIds: vi.fn().mockResolvedValue(undefined),
    addAlbumExternalIds: vi.fn().mockResolvedValue(undefined),
    addArtistExternalIds: vi.fn().mockResolvedValue(undefined),
  };
}

describe("saveExternalIdsLogged", () => {
  beforeEach(() => {
    debugMock.mockReset();
  });

  it("writes nothing when there are no records", async () => {
    const repo = makeRepo();
    await saveExternalIdsLogged(repo, "track", "track-1", [], FAILURE_MESSAGE);
    expect(repo.addTrackExternalIds).not.toHaveBeenCalled();
  });

  it("writes through the method of the entity kind", async () => {
    const repo = makeRepo();
    await saveExternalIdsLogged(repo, "track", "track-1", [RECORD], FAILURE_MESSAGE);
    await saveExternalIdsLogged(repo, "album", "album-1", [RECORD], FAILURE_MESSAGE);
    await saveExternalIdsLogged(repo, "artist", "artist-1", [RECORD], FAILURE_MESSAGE);
    expect(repo.addTrackExternalIds.mock.calls).toEqual([["track-1", [RECORD]]]);
    expect(repo.addAlbumExternalIds.mock.calls).toEqual([["album-1", [RECORD]]]);
    expect(repo.addArtistExternalIds.mock.calls).toEqual([["artist-1", [RECORD]]]);
  });

  it("logs a failed write instead of throwing", async () => {
    const repo = makeRepo();
    repo.addAlbumExternalIds.mockRejectedValue(new Error("unique violation"));
    await expect(saveExternalIdsLogged(repo, "album", "album-1", [RECORD], FAILURE_MESSAGE)).resolves.toBeUndefined();
    expect(debugMock.mock.calls).toEqual([["Resolve", FAILURE_MESSAGE, "unique violation"]]);
  });
});
