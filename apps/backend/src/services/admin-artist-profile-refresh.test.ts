import type { ArtistProfile } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";
import type { ArtistProfileRefreshEvent } from "../db/admin-repository.js";
import type { ArtistCacheRow } from "../db/repository.js";
import {
  AdminArtistProfileRefreshError,
  createAdminArtistProfileRefreshService,
} from "./admin-artist-profile-refresh.js";

const STARTED_AT = new Date("2026-07-19T20:00:00.000Z");
const COMPLETED_AT = new Date("2026-07-19T20:00:05.000Z");
const PROFILE: ArtistProfile = {
  imageUrl: "https://images.example/artist.jpg",
  genres: ["dream pop"],
  popularity: 42,
  followers: 1200,
  bioSummary: "Artist biography",
  scrobbles: 5000,
  similarArtists: ["Related Artist"],
};

function event(overrides: Partial<ArtistProfileRefreshEvent> = {}): ArtistProfileRefreshEvent {
  return {
    id: "refresh-event-1",
    actorAdminId: "admin-1",
    artistEntityId: "artist-1",
    trigger: "manual",
    occurredAt: STARTED_AT,
    completedAt: null,
    outcome: "refreshing",
    errorCode: null,
    errorId: null,
    cause: null,
    ...overrides,
  };
}

function cache(): ArtistCacheRow {
  return {
    artistName: "Slowdive",
    topTracks: [],
    profile: PROFILE,
    profileProviders: ["spotify", "lastfm"],
    events: [],
    tracksUpdatedAt: 0,
    profileUpdatedAt: STARTED_AT.getTime(),
    eventsUpdatedAt: 0,
  };
}

function dependencies() {
  return {
    findArtistInfoEntity: vi.fn().mockResolvedValue({ artistEntityId: "artist-1", artistName: "Slowdive" }),
    findArtistCache: vi.fn().mockResolvedValue(cache()),
    refreshProfile: vi.fn().mockResolvedValue(PROFILE),
    beginArtistProfileRefresh: vi.fn().mockResolvedValue(event()),
    completeArtistProfileRefresh: vi.fn().mockResolvedValue(event({ completedAt: COMPLETED_AT, outcome: "succeeded" })),
    failArtistProfileRefresh: vi.fn(),
    now: vi.fn().mockReturnValueOnce(STARTED_AT).mockReturnValue(COMPLETED_AT),
    logDeviation: vi.fn(),
  };
}

describe("admin artist profile refresh service", () => {
  it("refreshes one entity synchronously and completes the same audit event", async () => {
    const deps = dependencies();
    const refresh = createAdminArtistProfileRefreshService(deps);

    await expect(
      refresh({ actorAdminId: "admin-1", artistEntityId: "artist-1", requestId: "request-1" }),
    ).resolves.toEqual({
      artistEntityId: "artist-1",
      profileCache: {
        state: "fresh",
        profileUpdatedAt: STARTED_AT.toISOString(),
        ageMs: 5000,
        providers: ["spotify", "lastfm"],
        latestManualRefresh: {
          trigger: "manual",
          occurredAt: STARTED_AT.toISOString(),
          completedAt: COMPLETED_AT.toISOString(),
          outcome: "succeeded",
          errorCode: null,
          errorId: null,
        },
      },
      manualRefresh: {
        trigger: "manual",
        occurredAt: STARTED_AT.toISOString(),
        completedAt: COMPLETED_AT.toISOString(),
        outcome: "succeeded",
        errorCode: null,
        errorId: null,
      },
    });
    expect(deps.beginArtistProfileRefresh).toHaveBeenCalledWith({
      actorAdminId: "admin-1",
      artistEntityId: "artist-1",
      occurredAt: STARTED_AT,
    });
    expect(deps.refreshProfile).toHaveBeenCalledWith({
      identity: { kind: "entity", artistEntityId: "artist-1" },
      artistName: "Slowdive",
      requestId: "request-1",
      startedAt: STARTED_AT.getTime(),
    });
    expect(deps.completeArtistProfileRefresh).toHaveBeenCalledWith("refresh-event-1", COMPLETED_AT);
    expect(deps.failArtistProfileRefresh).not.toHaveBeenCalled();
  });

  it("rejects an unknown entity without creating an audit event", async () => {
    const deps = dependencies();
    deps.findArtistInfoEntity.mockResolvedValue(null);
    const refresh = createAdminArtistProfileRefreshService(deps);

    const error = await refresh({
      actorAdminId: "admin-1",
      artistEntityId: "missing-artist",
      requestId: "request-2",
    }).catch((cause) => cause);

    expect(error).toBeInstanceOf(AdminArtistProfileRefreshError);
    expect(error).toMatchObject({ statusCode: 404, response: { error: "MC-RES-0003" } });
    expect(deps.beginArtistProfileRefresh).not.toHaveBeenCalled();
  });

  it("records a provider failure without overwriting the last-good profile", async () => {
    const deps = dependencies();
    deps.refreshProfile.mockResolvedValue(null);
    deps.failArtistProfileRefresh.mockImplementation(async (_id, data) =>
      event({
        completedAt: data.completedAt,
        outcome: "failed",
        errorCode: data.errorCode,
        errorId: data.errorId,
        cause: data.cause,
      }),
    );
    const refresh = createAdminArtistProfileRefreshService(deps);

    const error = await refresh({
      actorAdminId: "admin-1",
      artistEntityId: "artist-1",
      requestId: "request-3",
    }).catch((cause) => cause);

    expect(error).toBeInstanceOf(AdminArtistProfileRefreshError);
    expect(error).toMatchObject({ statusCode: 502, response: { error: "MC-API-0001" } });
    expect(deps.findArtistCache).not.toHaveBeenCalled();
    expect(deps.completeArtistProfileRefresh).not.toHaveBeenCalled();
    expect(deps.failArtistProfileRefresh).toHaveBeenCalledWith(
      "refresh-event-1",
      expect.objectContaining({
        completedAt: COMPLETED_AT,
        errorCode: "MC-API-0001",
        errorId: error.response.errorId,
        cause: "Artist profile providers returned no usable profile data.",
      }),
    );
  });

  it("classifies unexpected failures and stores only a redacted cause", async () => {
    const deps = dependencies();
    deps.refreshProfile.mockRejectedValue(
      new Error("postgresql://admin:secret@prod.example/musiccloud Bearer token-value"),
    );
    const refresh = createAdminArtistProfileRefreshService(deps);

    const error = await refresh({
      actorAdminId: "admin-1",
      artistEntityId: "artist-1",
      requestId: "request-4",
    }).catch((cause) => cause);

    expect(error).toMatchObject({ statusCode: 500, response: { error: "MC-SYS-0001" } });
    expect(deps.failArtistProfileRefresh).toHaveBeenCalledWith(
      "refresh-event-1",
      expect.objectContaining({
        errorCode: "MC-SYS-0001",
        errorId: error.response.errorId,
        cause: "[REDACTED_DB_URL] Bearer [REDACTED]",
      }),
    );
  });
});
