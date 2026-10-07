import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repo: {
    persistTrackWithLinks: vi.fn(),
    addTrackExternalIds: vi.fn(async () => undefined),
    upsertTrackPreview: vi.fn(async () => undefined),
    updateTrackTimestamp: vi.fn(async () => undefined),
  },
  deezerFindByIsrc: vi.fn(async () => null),
}));

vi.mock("../../db/index.js", () => ({ getRepository: async () => mocks.repo }));
vi.mock("../plugins/deezer/adapter.js", () => ({
  deezerAdapter: { isAvailable: () => true, findByIsrc: mocks.deezerFindByIsrc },
}));

import { persistResolution } from "../persist-resolution.js";
import type { ResolutionResult } from "../resolver.js";

const CREDITS = [{ artistEntityId: "artist-1", name: "Queen", role: "main" as const, position: 0 }];

function resolution(overrides: Partial<ResolutionResult> = {}): ResolutionResult {
  return {
    sourceTrack: {
      sourceService: "spotify",
      sourceId: "track123",
      title: "Bohemian Rhapsody",
      artists: ["Queen"],
      artistCredits: CREDITS,
      isrc: "GBUM71029604",
      webUrl: "https://open.spotify.com/track/track123",
    },
    links: [
      {
        service: "deezer",
        displayName: "Deezer",
        url: "https://www.deezer.com/track/1",
        confidence: 1,
        matchMethod: "isrc",
      },
    ],
    externalIds: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repo.persistTrackWithLinks.mockResolvedValue({
    trackId: "new-track",
    shortId: "new-short",
    artistCredits: CREDITS,
  });
});

describe("persistResolution", () => {
  it("does not rewrite a track that came from the cache", async () => {
    const persisted = await persistResolution(resolution({ trackId: "stored-track", shortId: "stored-short" }));

    expect(mocks.repo.persistTrackWithLinks).not.toHaveBeenCalled();
    expect(mocks.repo.upsertTrackPreview).not.toHaveBeenCalled();
    expect(mocks.deezerFindByIsrc).not.toHaveBeenCalled();
    expect(mocks.repo.updateTrackTimestamp).toHaveBeenCalledWith("stored-track");
    expect(persisted).toEqual({
      trackId: "stored-track",
      shortId: "stored-short",
      refreshedPreviewUrl: undefined,
      artistCredits: CREDITS,
    });
  });

  it("still stores the external ids a cached resolve observed", async () => {
    const externalIds = [{ idType: "isrc", idValue: "GBUM71029604", sourceService: "deezer" }];

    await persistResolution(resolution({ trackId: "stored-track", shortId: "stored-short", externalIds }));

    expect(mocks.repo.addTrackExternalIds).toHaveBeenCalledWith("stored-track", externalIds);
  });

  it("persists a fresh resolve in full", async () => {
    const persisted = await persistResolution(resolution());

    expect(mocks.repo.persistTrackWithLinks).toHaveBeenCalledOnce();
    expect(persisted.trackId).toBe("new-track");
    expect(persisted.shortId).toBe("new-short");
  });
});
