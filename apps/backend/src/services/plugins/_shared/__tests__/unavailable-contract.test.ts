import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The adapter contract: a lookup or search answers "nothing" only when the
 * service answered. When it failed, the adapter throws, because the resolver
 * records a returned miss for a month and skips the service for that long.
 */

const fetchWithTimeoutMock = vi.fn();
vi.mock("../../../../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (url: string, init?: RequestInit, timeoutMs?: number) => fetchWithTimeoutMock(url, init, timeoutMs),
}));

vi.mock("../../../../lib/infra/token-manager.js", () => ({
  TokenManager: class {
    isConfigured() {
      return true;
    }
    async getAccessToken() {
      return "test-token";
    }
    reset() {}
  },
}));

import { appleMusicAdapter } from "../../apple-music/adapter.js";
import { spotifyAdapter } from "../../spotify/adapter.js";
import { youtubeAdapter } from "../../youtube/adapter.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  fetchWithTimeoutMock.mockReset();
  vi.stubEnv("APPLE_MUSIC_TOKEN", "static-test-token");
  vi.stubEnv("YOUTUBE_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Spotify", () => {
  it("throws when every search query failed", async () => {
    fetchWithTimeoutMock.mockImplementation(async () => jsonResponse({}, 503));

    await expect(spotifyAdapter.searchTrack({ title: "Alison", artist: "Slowdive" })).rejects.toThrow(/503/);
  });

  it("answers from the queries that did answer when some failed", async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockImplementation(async () => jsonResponse({ tracks: { items: [] } }));

    await expect(spotifyAdapter.searchTrack({ title: "Alison", artist: "Slowdive" })).resolves.toMatchObject({
      found: false,
    });
  });

  it("throws when the UPC lookup failed", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse({}, 429));

    await expect(spotifyAdapter.findAlbumByUpc?.("094638246428")).rejects.toThrow(/429/);
  });
});

describe("Apple Music", () => {
  it("throws when no storefront answered the ISRC lookup", async () => {
    fetchWithTimeoutMock.mockImplementation(async () => jsonResponse({}, 500));

    await expect(appleMusicAdapter.findByIsrc("GBUM71029604")).rejects.toThrow(/500/);
  });

  it("returns null when a storefront answered with nothing", async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockImplementation(async () => jsonResponse({ data: [] }));

    await expect(appleMusicAdapter.findByIsrc("GBUM71029604")).resolves.toBeNull();
  });

  it("throws when no storefront answered the search", async () => {
    fetchWithTimeoutMock.mockImplementation(async () => jsonResponse({}, 503));

    await expect(appleMusicAdapter.searchTrack({ title: "Alison", artist: "Slowdive" })).rejects.toThrow(/503/);
  });
});

describe("YouTube", () => {
  it("throws when the search is refused, such as for an exhausted quota", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse({ error: { code: 403 } }, 403));

    await expect(youtubeAdapter.searchTrack({ title: "Alison", artist: "Slowdive" })).rejects.toThrow(/403/);
  });

  it("answers not found for an empty result", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse({ items: [] }));

    await expect(youtubeAdapter.searchTrack({ title: "Alison", artist: "Slowdive" })).resolves.toMatchObject({
      found: false,
    });
  });
});
