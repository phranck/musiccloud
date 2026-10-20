import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import observedSpotifyCandidates from "../../spotify/__tests__/fixtures/get-lucky-candidates.json";

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
  it("selects the observed studio recording through both public search methods", async () => {
    fetchWithTimeoutMock.mockImplementation(async (input: string) => {
      const params = new URL(input).searchParams;
      const offset = Number(params.get("offset") ?? 0);
      const limit = Number(params.get("limit") ?? 5);
      return jsonResponse({ tracks: { items: observedSpotifyCandidates.tracks.items.slice(offset, offset + limit) } });
    });
    const query = { title: "Get Lucky", artist: "Daft Punk", artists: ["Daft Punk"] };
    const plain = await spotifyAdapter.searchTrack(query);
    const candidates = await spotifyAdapter.searchTrackWithCandidates(query);
    for (const result of [plain, candidates.bestMatch]) {
      expect(result.found).toBe(true);
      expect(result.track?.sourceId).toBe("69kOkLUCkxIZYexIgSG8rq");
      expect(result.track?.isrc).toBe("USQX91300108");
      expect(result.confidence).toBeCloseTo(0.8);
    }
    expect(candidates.candidates.every((candidate) => candidate.track.isrc === "USQX91300108")).toBe(true);
  });

  it("rejects an incomplete candidate miss when a later page failed", async () => {
    const cover = observedSpotifyCandidates.tracks.items.find((track) => track.external_ids.isrc === "BXCPT2000157");
    fetchWithTimeoutMock.mockImplementation(async (input: string) => {
      const offset = Number(new URL(input).searchParams.get("offset") ?? 0);
      return offset === 0
        ? jsonResponse({ tracks: { items: Array.from({ length: 10 }, () => cover) } })
        : jsonResponse({}, 503);
    });
    await expect(
      spotifyAdapter.searchTrackWithCandidates({ title: "Get Lucky", artist: "Daft Punk", artists: ["Daft Punk"] }),
    ).rejects.toThrow(/503/);
  });

  it("throws when every search query failed", async () => {
    fetchWithTimeoutMock.mockImplementation(async () => jsonResponse({}, 503));

    await expect(spotifyAdapter.searchTrack({ title: "Alison", artist: "Slowdive" })).rejects.toThrow(/503/);
  });

  it("rejects an incomplete negative search when one query failed", async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockImplementation(async () => jsonResponse({ tracks: { items: [] } }));

    await expect(spotifyAdapter.searchTrack({ title: "Alison", artist: "Slowdive" })).rejects.toThrow(/503/);
  });

  it("retains a verified positive recording when another query failed", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({}, 503)).mockImplementation(async () =>
      jsonResponse({
        tracks: {
          items: [
            {
              id: "69kOkLUCkxIZYexIgSG8rq",
              name: "Get Lucky (feat. Pharrell Williams and Nile Rodgers)",
              artists: [{ name: "Daft Punk" }, { name: "Pharrell Williams" }, { name: "Nile Rodgers" }],
              external_ids: { isrc: "USQX91300108" },
            },
          ],
        },
      }),
    );
    await expect(spotifyAdapter.searchTrack({ title: "Get Lucky", artist: "Daft Punk" })).resolves.toMatchObject({
      found: true,
      track: { sourceId: "69kOkLUCkxIZYexIgSG8rq", isrc: "USQX91300108" },
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

  it("rejects an incomplete negative lookup when a storefront failed", async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockImplementation(async () => jsonResponse({ data: [] }));

    await expect(appleMusicAdapter.findByIsrc("GBUM71029604")).rejects.toThrow(/500/);
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
