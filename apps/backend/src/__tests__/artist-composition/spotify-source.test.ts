import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/infra/token-manager.js", () => ({
  TokenManager: class {
    isConfigured() {
      return true;
    }
    async getAccessToken() {
      return "test-token";
    }
  },
}));

const fetchWithTimeoutMock = vi.fn();

vi.mock("../../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (url: string, init?: RequestInit, timeoutMs?: number) => fetchWithTimeoutMock(url, init, timeoutMs),
}));

import { fetchSpotifyArtistPartial } from "../../services/artist-composition/sources/spotify-source";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

const ARTIST = {
  id: "4tZwfgrHOc3mvqYlEYSvVi",
  genres: ["alt-rock", "indie", "shoegaze", "post-rock"],
  images: [
    { url: "https://i.scdn.co/image/big.jpg", width: 640, height: 640 },
    { url: "https://i.scdn.co/image/small.jpg", width: 64, height: 64 },
  ],
};

beforeEach(() => {
  fetchWithTimeoutMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchSpotifyArtistPartial", () => {
  it("returns Partial with __source 'spotify', imageUrl, and genres only (post-Feb-2026)", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({ artists: { items: [ARTIST] } }));
    const partial = await fetchSpotifyArtistPartial("Slowdive");
    expect(partial).toEqual({
      __source: "spotify",
      imageUrl: "https://i.scdn.co/image/big.jpg",
      genres: ["alt-rock", "indie", "shoegaze"],
    });
  });

  it("caps genres at 3", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({ artists: { items: [ARTIST] } }));
    const partial = await fetchSpotifyArtistPartial("Slowdive");
    expect(partial?.genres).toHaveLength(3);
  });

  it("returns null when search yields no artist", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({ artists: { items: [] } }));
    expect(await fetchSpotifyArtistPartial("Nobody")).toBeNull();
  });

  it("returns null on non-OK response", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({}, 503));
    expect(await fetchSpotifyArtistPartial("Slowdive")).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    fetchWithTimeoutMock.mockRejectedValueOnce(new Error("network down"));
    expect(await fetchSpotifyArtistPartial("Slowdive")).toBeNull();
  });
});
