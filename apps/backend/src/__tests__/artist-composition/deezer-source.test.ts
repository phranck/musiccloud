import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithTimeoutMock = vi.fn();

vi.mock("../../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (url: string, init?: RequestInit, timeoutMs?: number) => fetchWithTimeoutMock(url, init, timeoutMs),
}));

import { fetchDeezerArtistPartial } from "../../services/artist-composition/sources/deezer-source";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

const SEARCH_HIT = {
  id: 12345,
  name: "Slowdive",
  picture_xl: "https://e-cdns-images.dzcdn.net/images/artist/abc/1000x1000.jpg",
  picture_big: "https://e-cdns-images.dzcdn.net/images/artist/abc/500x500.jpg",
};

const FAN_RESPONSE = { id: 12345, nb_fan: 250000 };

const TOP_TRACK = {
  title: "Alison",
  duration: 215,
  link: "https://www.deezer.com/track/123",
  album: { title: "Souvlaki", cover_medium: "https://cdn/cover.jpg" },
  artist: { name: "Slowdive" },
};

function routeDeezerCalls(opts: {
  search?: unknown;
  searchStatus?: number;
  fans?: unknown;
  fansStatus?: number;
  topTracks?: unknown;
  topTracksStatus?: number;
}): void {
  fetchWithTimeoutMock.mockImplementation(async (url: string) => {
    if (url.includes("/search/artist")) {
      return jsonResponse(opts.search ?? { data: [] }, opts.searchStatus ?? 200);
    }
    if (url.includes("/top")) {
      return jsonResponse(opts.topTracks ?? { data: [] }, opts.topTracksStatus ?? 200);
    }
    if (url.includes("/artist/")) {
      return jsonResponse(opts.fans ?? FAN_RESPONSE, opts.fansStatus ?? 200);
    }
    throw new Error(`unexpected URL: ${url}`);
  });
}

beforeEach(() => {
  fetchWithTimeoutMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchDeezerArtistPartial", () => {
  it("returns Partial with __source 'deezer', imageUrl, followers, topTracks", async () => {
    routeDeezerCalls({
      search: { data: [SEARCH_HIT] },
      fans: FAN_RESPONSE,
      topTracks: { data: [TOP_TRACK] },
    });

    const partial = await fetchDeezerArtistPartial("Slowdive");
    expect(partial).toMatchObject({
      __source: "deezer",
      imageUrl: SEARCH_HIT.picture_xl,
      followers: 250000,
      topTracks: [
        {
          title: "Alison",
          artists: ["Slowdive"],
          albumName: "Souvlaki",
          deezerUrl: "https://www.deezer.com/track/123",
        },
      ],
    });
  });

  it("returns null when search yields no hit", async () => {
    routeDeezerCalls({ search: { data: [] } });
    expect(await fetchDeezerArtistPartial("Nobody")).toBeNull();
  });

  it("returns Partial with null followers when fan-count fetch fails", async () => {
    routeDeezerCalls({
      search: { data: [SEARCH_HIT] },
      fansStatus: 500,
      topTracks: { data: [] },
    });

    const partial = await fetchDeezerArtistPartial("Slowdive");
    expect(partial?.followers).toBeNull();
    expect(partial?.imageUrl).toBe(SEARCH_HIT.picture_xl);
  });
});
