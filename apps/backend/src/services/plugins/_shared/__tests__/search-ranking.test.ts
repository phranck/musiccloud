import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adapters rank what their service answered through the shared scorers.
 *
 * An album search counts the year and the track count the user asked for, so
 * of two otherwise identical candidates the one that matches them wins. Each
 * album case answers the search with two such candidates, the matching one
 * second, so a score that ignores the term picks the first. A free-text track
 * search trusts the service's ranking, so its first hit is found.
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
import { deezerAdapter } from "../../deezer/adapter.js";
import { tidalAdapter } from "../../tidal/adapter.js";
import { youtubeAdapter } from "../../youtube/adapter.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** The album asked for: released 1993 with ten tracks. */
const QUERY = { title: "Souvlaki", artist: "Slowdive", year: "1993", totalTracks: 10 };

describe("free-text track search", () => {
  it("finds the first hit on Apple Music, as on every other service", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({
        results: {
          songs: {
            data: [
              {
                id: "1",
                type: "songs",
                attributes: { name: "Alison", artistName: "Slowdive", url: "https://music.apple.com/song/1" },
              },
            ],
          },
        },
      }),
    );

    const result = await appleMusicAdapter.searchTrack({ ...FREE_TEXT });

    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Alison");
  });

  it("finds the first hit on YouTube and asks with the text once", async () => {
    fetchWithTimeoutMock.mockImplementation(async (url: string) =>
      url.includes("/search?")
        ? jsonResponse({ items: [{ id: { videoId: "v1" }, snippet: { title: "Slowdive - Alison" } }] })
        : jsonResponse({
            items: [
              {
                id: "v1",
                snippet: { title: "Slowdive - Alison", channelTitle: "Slowdive", thumbnails: {} },
                contentDetails: { duration: "PT3M50S" },
              },
            ],
          }),
    );

    const result = await youtubeAdapter.searchTrack({ ...FREE_TEXT });

    expect(result.found).toBe(true);
    const searchUrl = new URL(fetchWithTimeoutMock.mock.calls[0]?.[0] as string);
    expect(searchUrl.searchParams.get("q")).toBe("slowdive alison official");
  });
});

/** A free-text search, which the resolver marks by sending the text as title and artist. */
const FREE_TEXT = { title: "slowdive alison", artist: "slowdive alison" };

beforeEach(() => {
  fetchWithTimeoutMock.mockReset();
  vi.stubEnv("APPLE_MUSIC_TOKEN", "static-test-token");
  vi.stubEnv("YOUTUBE_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Deezer album search", () => {
  it("prefers the candidate from the year asked for", async () => {
    const candidate = (id: number, releaseDate: string) => ({
      id,
      title: "Souvlaki",
      artist: { name: "Slowdive" },
      release_date: releaseDate,
      nb_tracks: 10,
      link: `https://www.deezer.com/album/${id}`,
    });
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({ data: [candidate(1, "2005-04-11"), candidate(2, "1993-06-01")], total: 2 }),
    );

    const result = await deezerAdapter.searchAlbum({ ...QUERY });

    expect(result.album?.sourceId).toBe("2");
  });
});

describe("Tidal album search", () => {
  it("prefers the candidate from the year asked for", async () => {
    const candidate = (id: string, releaseDate: string) => ({
      id,
      type: "albums",
      attributes: { title: "Souvlaki", releaseDate, numberOfItems: 10 },
      relationships: { artists: { data: [{ id: "artist-1" }] } },
    });
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({
        data: [candidate("1", "2005-04-11"), candidate("2", "1993-06-01")],
        included: [{ id: "artist-1", type: "artists", attributes: { name: "Slowdive" } }],
      }),
    );

    const result = await tidalAdapter.searchAlbum({ ...QUERY });

    expect(result.album?.sourceId).toBe("2");
  });
});
