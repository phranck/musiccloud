import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Token manager mock (Spotify image lookup) -------------------------------------

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

// fetchWithTimeout mock -----------------------------------------------------

const fetchWithTimeoutMock = vi.fn();
vi.mock("../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (url: string, init?: RequestInit, timeoutMs?: number) => fetchWithTimeoutMock(url, init, timeoutMs),
}));

// pg pool mock — capture the parameters passed to INSERT ---------------------

const queryMock = vi.fn();
vi.mock("pg", () => ({
  default: {
    Pool: class {
      query = queryMock;
    },
  },
  Pool: class {
    query = queryMock;
  },
}));

vi.mock("../db/config.js", () => ({
  loadDatabaseConfig: () => ({ url: "postgres://test" }),
}));

import { getArtistImages } from "../services/image-cache";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

const DEEZER_HIT = {
  data: [
    {
      id: 99,
      name: "Slowdive",
      picture_xl: "https://e-cdns-images.dzcdn.net/images/artist/abc/1000x1000.jpg",
    },
  ],
};

const SPOTIFY_HIT = {
  artists: {
    items: [
      {
        images: [{ url: "https://i.scdn.co/image/spotify-img.jpg", width: 640, height: 640 }],
      },
    ],
  },
};

beforeEach(() => {
  fetchWithTimeoutMock.mockReset();
  queryMock.mockReset();
  // Default: SELECT lookup returns no cached rows
  queryMock.mockResolvedValue({ rows: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getArtistImages — source priority", () => {
  it("uses Deezer first when Deezer has the artist", async () => {
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.includes("api.deezer.com")) return jsonResponse(DEEZER_HIT);
      if (url.includes("api.spotify.com")) return jsonResponse(SPOTIFY_HIT);
      throw new Error(`unexpected: ${url}`);
    });

    const result = await getArtistImages(["Slowdive"]);
    expect(result.get("Slowdive")).toBe(DEEZER_HIT.data[0].picture_xl);

    // Verify cacheArtistImage was called with source "deezer".
    const insertCall = queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO artist_images"));
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[2]).toBe(DEEZER_HIT.data[0].picture_xl);
    expect(params[3]).toBe("deezer");
  });

  it("falls back to Spotify when Deezer has no artist", async () => {
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.includes("api.deezer.com")) return jsonResponse({ data: [] });
      if (url.includes("api.spotify.com")) return jsonResponse(SPOTIFY_HIT);
      throw new Error(`unexpected: ${url}`);
    });

    const result = await getArtistImages(["Slowdive"]);
    expect(result.get("Slowdive")).toBe("https://i.scdn.co/image/spotify-img.jpg");

    const insertCall = queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO artist_images"));
    expect(insertCall).toBeDefined();
    expect((insertCall![1] as unknown[])[3]).toBe("spotify");
  });

  it("returns empty map when both sources miss", async () => {
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.includes("api.deezer.com")) return jsonResponse({ data: [] });
      if (url.includes("api.spotify.com")) return jsonResponse({ artists: { items: [] } });
      throw new Error(`unexpected: ${url}`);
    });

    const result = await getArtistImages(["Nobody"]);
    expect(result.size).toBe(0);

    const insertCall = queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO artist_images"));
    expect(insertCall).toBeUndefined();
  });

  it("skips lookup when DB cache already has the entry", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValueOnce({
      rows: [{ name_key: "slowdive", image_url: "https://cached/img.jpg" }],
    });

    const result = await getArtistImages(["Slowdive"]);
    expect(result.get("Slowdive")).toBe("https://cached/img.jpg");
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
  });

  it("treats Deezer silhouette as missing and tries Spotify", async () => {
    const SILHOUETTE = {
      data: [
        {
          id: 99,
          name: "Slowdive",
          picture_xl: "https://e-cdns-images.dzcdn.net/images/artist/d41d8cd98f00b204e9800998ecf8427e/1000x1000.jpg",
        },
      ],
    };
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.includes("api.deezer.com")) return jsonResponse(SILHOUETTE);
      if (url.includes("api.spotify.com")) return jsonResponse(SPOTIFY_HIT);
      throw new Error(`unexpected: ${url}`);
    });

    const result = await getArtistImages(["Slowdive"]);
    expect(result.get("Slowdive")).toBe("https://i.scdn.co/image/spotify-img.jpg");
  });
});
