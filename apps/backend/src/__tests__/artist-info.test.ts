import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks ----------------------------------------------------------------------

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

const fetchWithTimeoutMock = vi.fn();
vi.mock("../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (url: string, init?: RequestInit, timeoutMs?: number) => fetchWithTimeoutMock(url, init, timeoutMs),
}));

import { fetchArtistProfile, fetchArtistTopTracks } from "../services/artist-info";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

// Canonical fixtures used by the URL-routed mock dispatcher below.

const SPOTIFY_HIT = {
  artists: {
    items: [
      {
        id: "4tZwfgrHOc3mvqYlEYSvVi",
        genres: ["synth-pop", "new wave"],
        images: [{ url: "https://i.scdn.co/image/abc.jpg", width: 640, height: 640 }],
      },
    ],
  },
};

const DEEZER_SEARCH_HIT = {
  data: [
    {
      id: 27,
      name: "Daft Punk",
      picture_xl: "https://e-cdns-images.dzcdn.net/images/artist/abc/1000x1000.jpg",
    },
  ],
};

const DEEZER_FANS = { id: 27, nb_fan: 9123456 };

const DEEZER_TOP_TRACKS = {
  data: [
    {
      title: "One More Time",
      duration: 320,
      link: "https://www.deezer.com/track/1",
      album: { title: "Discovery", cover_medium: "https://cdn/cover.jpg" },
      artist: { name: "Daft Punk" },
    },
  ],
};

const LASTFM_INFO = {
  artist: {
    bio: { summary: "<p>Daft Punk biography. <a>read more</a></p>" },
    stats: { playcount: "987654321", listeners: "12345678" },
    similar: { artist: [{ name: "Justice" }, { name: "Stardust" }] },
  },
};

const LASTFM_TAGS = {
  toptags: { tag: [{ name: "electronic" }, { name: "house" }] },
};

const LASTFM_TOP_TRACKS = {
  toptracks: {
    track: [{ name: "Around the World", url: "https://last.fm/track/atw", artist: { name: "Daft Punk" } }],
  },
};

// Dispatcher ----------------------------------------------------------------

interface RouteOptions {
  spotify?: unknown | "throw" | "404";
  deezerSearch?: unknown;
  deezerFans?: unknown;
  deezerTopTracks?: unknown;
  lastfmInfo?: unknown;
  lastfmTags?: unknown;
  lastfmTopTracks?: unknown;
  bandsintown?: unknown;
  ticketmaster?: unknown;
}

function route(opts: RouteOptions): void {
  fetchWithTimeoutMock.mockImplementation(async (url: string) => {
    if (url.includes("api.spotify.com")) {
      if (opts.spotify === "throw") throw new Error("spotify down");
      if (opts.spotify === "404") return jsonResponse({}, 404);
      return jsonResponse(opts.spotify ?? { artists: { items: [] } });
    }
    if (url.includes("api.deezer.com/search/artist")) {
      return jsonResponse(opts.deezerSearch ?? { data: [] });
    }
    if (url.includes("api.deezer.com/artist/") && url.includes("/top")) {
      return jsonResponse(opts.deezerTopTracks ?? { data: [] });
    }
    if (url.includes("api.deezer.com/artist/")) {
      return jsonResponse(opts.deezerFans ?? { id: 0 });
    }
    if (url.includes("audioscrobbler.com") && url.includes("artist.getInfo")) {
      return jsonResponse(opts.lastfmInfo ?? {});
    }
    if (url.includes("audioscrobbler.com") && url.includes("artist.getTopTags")) {
      return jsonResponse(opts.lastfmTags ?? { toptags: { tag: [] } });
    }
    if (url.includes("audioscrobbler.com") && url.includes("artist.getTopTracks")) {
      return jsonResponse(opts.lastfmTopTracks ?? { toptracks: { track: [] } });
    }
    if (url.includes("bandsintown.com")) return jsonResponse(opts.bandsintown ?? []);
    if (url.includes("ticketmaster.com")) return jsonResponse(opts.ticketmaster ?? {});
    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

const ORIGINAL_LASTFM_KEY = process.env.LASTFM_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LASTFM_API_KEY = "test-key";
});

afterEach(() => {
  if (ORIGINAL_LASTFM_KEY === undefined) delete process.env.LASTFM_API_KEY;
  else process.env.LASTFM_API_KEY = ORIGINAL_LASTFM_KEY;
});

// Tests ---------------------------------------------------------------------

describe("fetchArtistProfile", () => {
  it("returns fully populated profile when all three sources answer", async () => {
    route({
      spotify: SPOTIFY_HIT,
      deezerSearch: DEEZER_SEARCH_HIT,
      deezerFans: DEEZER_FANS,
      deezerTopTracks: DEEZER_TOP_TRACKS,
      lastfmInfo: LASTFM_INFO,
      lastfmTags: LASTFM_TAGS,
      lastfmTopTracks: LASTFM_TOP_TRACKS,
    });

    const profile = await fetchArtistProfile("Daft Punk");
    expect(profile).not.toBeNull();
    expect(profile?.imageUrl).toBe(DEEZER_SEARCH_HIT.data[0].picture_xl); // Deezer wins per strategy
    expect(profile?.genres).toEqual(["synth-pop", "new wave"]); // Spotify primary
    expect(profile?.popularity).toBe(12345678); // Last.fm listeners
    expect(profile?.followers).toBe(9123456); // Deezer nb_fan
    expect(profile?.scrobbles).toBe(987654321); // Last.fm playcount
    expect(profile?.bioSummary).toContain("Daft Punk biography");
    expect(profile?.similarArtists).toEqual(["Justice", "Stardust"]);
  });

  it("stays non-null when Spotify throws — Deezer + Last.fm carry the profile", async () => {
    route({
      spotify: "throw",
      deezerSearch: DEEZER_SEARCH_HIT,
      deezerFans: DEEZER_FANS,
      deezerTopTracks: DEEZER_TOP_TRACKS,
      lastfmInfo: LASTFM_INFO,
      lastfmTags: LASTFM_TAGS,
    });

    const profile = await fetchArtistProfile("Daft Punk");
    expect(profile).not.toBeNull();
    expect(profile?.imageUrl).toBe(DEEZER_SEARCH_HIT.data[0].picture_xl);
    expect(profile?.genres).toEqual(["electronic", "house"]); // Last.fm fallback
    expect(profile?.followers).toBe(9123456);
    expect(profile?.bioSummary).toContain("Daft Punk biography");
  });

  it("returns minimal profile when only Spotify is reachable (post-Feb-2026 contributes image + genres only)", async () => {
    route({ spotify: SPOTIFY_HIT });

    const profile = await fetchArtistProfile("Daft Punk");
    expect(profile).not.toBeNull();
    expect(profile?.imageUrl).toBe("https://i.scdn.co/image/abc.jpg");
    expect(profile?.genres).toEqual(["synth-pop", "new wave"]);
    expect(profile?.popularity).toBeNull();
    expect(profile?.followers).toBeNull();
    expect(profile?.scrobbles).toBeNull();
  });

  it("returns null when no source produces any data", async () => {
    delete process.env.LASTFM_API_KEY;
    route({}); // all defaults: Spotify empty, Deezer empty, Last.fm key missing
    const profile = await fetchArtistProfile("Nobody");
    expect(profile).toBeNull();
  });

  it("does not include spotifyId in the response shape", async () => {
    route({ spotify: SPOTIFY_HIT });
    const profile = await fetchArtistProfile("Daft Punk");
    expect(profile).not.toBeNull();
    expect(profile as Record<string, unknown> | null).not.toHaveProperty("spotifyId");
  });
});

describe("fetchArtistTopTracks", () => {
  it("returns Deezer top tracks when Deezer has data", async () => {
    route({
      deezerSearch: DEEZER_SEARCH_HIT,
      deezerFans: DEEZER_FANS,
      deezerTopTracks: DEEZER_TOP_TRACKS,
      lastfmTopTracks: LASTFM_TOP_TRACKS,
    });

    const tracks = await fetchArtistTopTracks("Daft Punk");
    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe("One More Time");
  });

  it("falls back to Last.fm top tracks when Deezer is empty", async () => {
    route({
      lastfmTopTracks: LASTFM_TOP_TRACKS,
    });

    const tracks = await fetchArtistTopTracks("Daft Punk");
    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe("Around the World");
  });

  it("returns empty array when both sources are empty", async () => {
    route({});
    const tracks = await fetchArtistTopTracks("Nobody");
    expect(tracks).toEqual([]);
  });
});
