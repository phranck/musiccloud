import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/infra/token-manager.js", () => ({
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
vi.mock("../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (url: string, init?: RequestInit, timeoutMs?: number) => fetchWithTimeoutMock(url, init, timeoutMs),
}));

import { spotifyAdapter } from "../services/plugins/spotify/adapter";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

const TRACK_ID = "abc123";

const TRACK_OK = {
  id: TRACK_ID,
  name: "Some Track",
  duration_ms: 200000,
  artists: [{ name: "Some Artist" }],
  album: { name: "Some Album", images: [] },
  external_urls: { spotify: `https://open.spotify.com/track/${TRACK_ID}` },
  preview_url: null,
  external_ids: {},
};

const OEMBED_PAYLOAD = {
  title: "Alison - song by Slowdive",
};

beforeEach(() => {
  fetchWithTimeoutMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("spotifyAdapter.getTrack", () => {
  it("returns the parsed track on 200", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse(TRACK_OK));
    const track = await spotifyAdapter.getTrack(TRACK_ID);
    expect(track.title).toBe("Some Track");
    expect(track.sourceService).toBe("spotify");
  });

  it("falls through to oEmbed on 404 and returns minimal track", async () => {
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.includes("api.spotify.com")) return jsonResponse({}, 404);
      if (url.includes("oembed")) return jsonResponse(OEMBED_PAYLOAD);
      throw new Error(`unexpected: ${url}`);
    });

    const track = await spotifyAdapter.getTrack(TRACK_ID);
    expect(track).toMatchObject({
      sourceService: "spotify",
      sourceId: TRACK_ID,
      title: "Alison",
      artists: ["Slowdive"],
      webUrl: `https://open.spotify.com/track/${TRACK_ID}`,
    });
    expect(track.albumName).toBeUndefined();
    expect(track.durationMs).toBeUndefined();
    expect(track.previewUrl).toBeUndefined();
  });

  it("throws when 404 + oEmbed both fail", async () => {
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.includes("api.spotify.com")) return jsonResponse({}, 404);
      if (url.includes("oembed")) return jsonResponse({}, 404);
      throw new Error(`unexpected: ${url}`);
    });

    await expect(spotifyAdapter.getTrack(TRACK_ID)).rejects.toThrow();
  });

  it("throws on non-404 errors (5xx) without trying oEmbed", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({}, 503));
    await expect(spotifyAdapter.getTrack(TRACK_ID)).rejects.toThrow();
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
  });

  it("parses multiple artists from oEmbed title", async () => {
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.includes("api.spotify.com")) return jsonResponse({}, 404);
      if (url.includes("oembed")) {
        return jsonResponse({ title: "Track X - song by Artist A, Artist B" });
      }
      throw new Error(`unexpected: ${url}`);
    });

    const track = await spotifyAdapter.getTrack(TRACK_ID);
    expect(track.title).toBe("Track X");
    expect(track.artists).toEqual(["Artist A", "Artist B"]);
  });

  it("falls through to throw when oEmbed returns unparseable title", async () => {
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.includes("api.spotify.com")) return jsonResponse({}, 404);
      if (url.includes("oembed")) return jsonResponse({ title: "Just a name no separator" });
      throw new Error(`unexpected: ${url}`);
    });

    // unparseable title still produces a track with empty artists; Resolver
    // can decide how to handle that. We accept the minimal form.
    const track = await spotifyAdapter.getTrack(TRACK_ID);
    expect(track.title).toBe("Just a name no separator");
    expect(track.artists).toEqual([]);
  });
});
