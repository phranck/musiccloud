import { describe, expect, it } from "vitest";
import {
  ARTIST_PROFILE_TTL_MS,
  type ArtistProfileManualRefreshSummary,
  classifyArtistProfileCacheStatus,
} from "./artist-profile-cache.js";

const NOW = new Date("2026-07-19T20:00:00.000Z");

function manualRefresh(overrides: Partial<ArtistProfileManualRefreshSummary> = {}): ArtistProfileManualRefreshSummary {
  return {
    trigger: "manual",
    occurredAt: "2026-07-19T19:59:00.000Z",
    completedAt: "2026-07-19T19:59:30.000Z",
    outcome: "succeeded",
    errorCode: null,
    errorId: null,
    ...overrides,
  };
}

describe("classifyArtistProfileCacheStatus", () => {
  it("classifies a profile without cached data as missing", () => {
    expect(
      classifyArtistProfileCacheStatus(
        {
          profileUpdatedAt: null,
          profileProviders: [],
          latestManualRefresh: null,
        },
        NOW,
      ),
    ).toEqual({
      state: "missing",
      profileUpdatedAt: null,
      ageMs: null,
      providers: [],
      latestManualRefresh: null,
    });
  });

  it("classifies a profile older than the profile TTL as stale", () => {
    const profileUpdatedAt = new Date(NOW.getTime() - ARTIST_PROFILE_TTL_MS - 1).toISOString();

    expect(
      classifyArtistProfileCacheStatus(
        {
          profileUpdatedAt,
          profileProviders: ["spotify"],
          latestManualRefresh: null,
        },
        NOW,
      ).state,
    ).toBe("stale");
  });

  it("classifies a profile within the profile TTL as fresh", () => {
    expect(
      classifyArtistProfileCacheStatus(
        {
          profileUpdatedAt: NOW.toISOString(),
          profileProviders: ["deezer"],
          latestManualRefresh: null,
        },
        NOW,
      ).state,
    ).toBe("fresh");
  });

  it("classifies an incomplete manual attempt as refreshing", () => {
    expect(
      classifyArtistProfileCacheStatus(
        {
          profileUpdatedAt: NOW.toISOString(),
          profileProviders: ["lastfm"],
          latestManualRefresh: manualRefresh({
            completedAt: null,
            outcome: "refreshing",
          }),
        },
        NOW,
      ).state,
    ).toBe("refreshing");
  });

  it("classifies a failed manual attempt newer than the cached profile as failed", () => {
    expect(
      classifyArtistProfileCacheStatus(
        {
          profileUpdatedAt: "2026-07-19T19:58:00.000Z",
          profileProviders: ["spotify"],
          latestManualRefresh: manualRefresh({
            outcome: "failed",
            errorCode: "MC-UPSTREAM-0001",
            errorId: "error-38",
          }),
        },
        NOW,
      ).state,
    ).toBe("failed");
  });

  it("keeps the cache state when an older manual attempt failed", () => {
    expect(
      classifyArtistProfileCacheStatus(
        {
          profileUpdatedAt: "2026-07-19T20:00:00.000Z",
          profileProviders: ["spotify"],
          latestManualRefresh: manualRefresh({
            occurredAt: "2026-07-19T19:59:00.000Z",
            outcome: "failed",
            errorCode: "MC-UPSTREAM-0001",
            errorId: "error-38",
          }),
        },
        NOW,
      ).state,
    ).toBe("fresh");
  });

  it("never reports a negative cache age", () => {
    expect(
      classifyArtistProfileCacheStatus(
        {
          profileUpdatedAt: "2026-07-19T20:00:01.000Z",
          profileProviders: ["spotify"],
          latestManualRefresh: null,
        },
        NOW,
      ).ageMs,
    ).toBe(0);
  });
});
