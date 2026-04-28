import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

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

vi.mock("../services/artist-images.js", () => ({
  cacheArtistImage: vi.fn().mockResolvedValue(undefined),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { fetchArtistProfile } from "../services/artist-info";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

const SPOTIFY_ARTIST = {
  id: "4tZwfgrHOc3mvqYlEYSvVi",
  genres: ["synth-pop", "new wave"],
  images: [{ url: "https://i.scdn.co/image/abc.jpg", width: 640, height: 640 }],
};

const LASTFM_PAYLOAD = {
  artist: {
    bio: { summary: "<p>Daft Punk biography. <a>Read more</a></p>" },
    stats: { playcount: "987654321", listeners: "12345678" },
    similar: { artist: [{ name: "Justice" }, { name: "Stardust" }] },
  },
};

function spotifySearchHit() {
  return jsonResponse({ artists: { items: [SPOTIFY_ARTIST] } });
}

function lastFmHit() {
  return jsonResponse(LASTFM_PAYLOAD);
}

function deezerSearchHit() {
  return jsonResponse({ data: [{ id: 27, name: "Daft Punk" }] });
}

function deezerArtistHit(nbFan: number) {
  return jsonResponse({ id: 27, name: "Daft Punk", nb_fan: nbFan });
}

function routeFetch(impl: (url: string) => Response | Promise<Response>) {
  fetchMock.mockImplementation((url: string) => Promise.resolve(impl(url)));
}

const ORIGINAL_LASTFM_KEY = process.env.LASTFM_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LASTFM_API_KEY = "test-lastfm-key";
});

afterEach(() => {
  if (ORIGINAL_LASTFM_KEY === undefined) delete process.env.LASTFM_API_KEY;
  else process.env.LASTFM_API_KEY = ORIGINAL_LASTFM_KEY;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("fetchArtistProfile", () => {
  it("returns null when Spotify returns no artist", async () => {
    routeFetch(() => jsonResponse({ artists: { items: [] } }));
    const profile = await fetchArtistProfile("Nonexistent Artist");
    expect(profile).toBeNull();
  });

  it("uses Last.fm listeners for popularity and Deezer nb_fan for followers", async () => {
    routeFetch((url) => {
      if (url.includes("api.spotify.com")) return spotifySearchHit();
      if (url.includes("audioscrobbler.com")) return lastFmHit();
      if (url.includes("/search/artist")) return deezerSearchHit();
      if (url.includes("/artist/27")) return deezerArtistHit(9123456);
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const profile = await fetchArtistProfile("Daft Punk");
    expect(profile).not.toBeNull();
    expect(profile?.popularity).toBe(12345678); // Last.fm listeners
    expect(profile?.followers).toBe(9123456); // Deezer nb_fan
    expect(profile?.scrobbles).toBe(987654321); // Last.fm playcount
    expect(profile?.spotifyId).toBe(SPOTIFY_ARTIST.id);
  });

  it("falls back to Last.fm listeners for followers when Deezer has no artist", async () => {
    routeFetch((url) => {
      if (url.includes("api.spotify.com")) return spotifySearchHit();
      if (url.includes("audioscrobbler.com")) return lastFmHit();
      if (url.includes("/search/artist")) return jsonResponse({ data: [] });
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const profile = await fetchArtistProfile("Daft Punk");
    expect(profile?.followers).toBe(12345678); // Last.fm listeners as surrogate
    expect(profile?.popularity).toBe(12345678);
  });

  it("falls back to Last.fm listeners when Deezer artist returns no nb_fan", async () => {
    routeFetch((url) => {
      if (url.includes("api.spotify.com")) return spotifySearchHit();
      if (url.includes("audioscrobbler.com")) return lastFmHit();
      if (url.includes("/search/artist")) return deezerSearchHit();
      if (url.includes("/artist/27")) return jsonResponse({ id: 27, name: "Daft Punk" });
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const profile = await fetchArtistProfile("Daft Punk");
    expect(profile?.followers).toBe(12345678);
  });

  it("returns null popularity and followers when Last.fm key is missing and Deezer misses", async () => {
    delete process.env.LASTFM_API_KEY;

    routeFetch((url) => {
      if (url.includes("api.spotify.com")) return spotifySearchHit();
      if (url.includes("/search/artist")) return jsonResponse({ data: [] });
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const profile = await fetchArtistProfile("Daft Punk");
    expect(profile?.popularity).toBeNull();
    expect(profile?.followers).toBeNull();
    expect(profile?.scrobbles).toBeNull();
  });
});
