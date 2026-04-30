import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithTimeoutMock = vi.fn();

vi.mock("../../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (url: string, init?: RequestInit, timeoutMs?: number) => fetchWithTimeoutMock(url, init, timeoutMs),
}));

import { fetchLastFmArtistPartial } from "../../services/artist-composition/sources/lastfm-source";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

const INFO_RESPONSE = {
  artist: {
    bio: { summary: "<p>Test bio</p><a>read more</a>" },
    stats: { playcount: "987654321", listeners: "1234567" },
    similar: { artist: [{ name: "My Bloody Valentine" }, { name: "Ride" }] },
  },
};

const TAGS_RESPONSE = {
  toptags: {
    tag: [{ name: "shoegaze" }, { name: "seen live" }, { name: "1990" }, { name: "alt-rock" }],
  },
};

const TOP_TRACKS_RESPONSE = {
  toptracks: {
    track: [{ name: "Alison", url: "https://last.fm/track/alison", artist: { name: "Slowdive" } }],
  },
};

// Route mock responses by API method to avoid Promise.all ordering races.
function routeLastFmCalls(opts: {
  info?: unknown;
  infoStatus?: number;
  tags?: unknown;
  tagsStatus?: number;
  topTracks?: unknown;
  topTracksStatus?: number;
}): void {
  fetchWithTimeoutMock.mockImplementation(async (url: string) => {
    if (url.includes("method=artist.getInfo")) {
      return jsonResponse(opts.info ?? {}, opts.infoStatus ?? 200);
    }
    if (url.includes("method=artist.getTopTags")) {
      return jsonResponse(opts.tags ?? { toptags: { tag: [] } }, opts.tagsStatus ?? 200);
    }
    if (url.includes("method=artist.getTopTracks")) {
      return jsonResponse(opts.topTracks ?? { toptracks: { track: [] } }, opts.topTracksStatus ?? 200);
    }
    throw new Error(`unexpected URL: ${url}`);
  });
}

beforeEach(() => {
  fetchWithTimeoutMock.mockReset();
  process.env.LASTFM_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.LASTFM_API_KEY;
});

describe("fetchLastFmArtistPartial", () => {
  it("returns Partial with all enrichment fields", async () => {
    routeLastFmCalls({ info: INFO_RESPONSE, tags: TAGS_RESPONSE, topTracks: TOP_TRACKS_RESPONSE });

    const partial = await fetchLastFmArtistPartial("Slowdive");
    expect(partial).toMatchObject({
      __source: "lastfm",
      genres: ["shoegaze", "alt-rock"],
      popularity: 1234567,
      followers: 1234567,
      scrobbles: 987654321,
      bioSummary: "Test bio",
      similarArtists: ["My Bloody Valentine", "Ride"],
      topTracks: [{ title: "Alison", artists: ["Slowdive"] }],
    });
  });

  it("returns null when LASTFM_API_KEY is unset", async () => {
    delete process.env.LASTFM_API_KEY;
    routeLastFmCalls({});
    const partial = await fetchLastFmArtistPartial("Slowdive");
    expect(partial).toBeNull();
  });

  it("returns null when info, tags, and top-tracks all empty", async () => {
    routeLastFmCalls({});
    const partial = await fetchLastFmArtistPartial("Nobody");
    expect(partial).toBeNull();
  });

  it("returns Partial when only tags are present (info missing)", async () => {
    routeLastFmCalls({ info: {}, tags: TAGS_RESPONSE });
    const partial = await fetchLastFmArtistPartial("Slowdive");
    expect(partial?.genres).toEqual(["shoegaze", "alt-rock"]);
    expect(partial?.popularity).toBeNull();
    expect(partial?.bioSummary).toBeNull();
  });
});
