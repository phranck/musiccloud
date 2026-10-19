import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The artist search contract: a service that answers with an artist whose name
 * is exactly the one searched for reports a match. Every adapter scores the
 * name with the one shared rule, so this holds for all of them or for none.
 *
 * Each case answers in its service's own response shape, routed by URL, so the
 * adapter's real parsing and scoring run and only the network is replaced.
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

import { MATCH_MIN_CONFIDENCE } from "../../../constants.js";
import { listPlugins } from "../../registry.js";
import { tidalSearchDocument } from "../../tidal/__tests__/search-document.js";

/** The artist every case searches for and every service answers with. */
const ARTIST = "Slowdive";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function text(body: string): Response {
  return new Response(body, { status: 200 });
}

/** One answer per service, chosen by what the request URL asks for. */
const ANSWERS: Record<string, (url: string) => Response | undefined> = {
  "apple-music": (url) =>
    url.includes("types=artists")
      ? json({
          results: {
            artists: { data: [{ id: "1", attributes: { name: ARTIST, url: "https://music.apple.com/us/artist/1" } }] },
          },
        })
      : undefined,
  youtube: (url) => {
    if (url.includes("/search?")) {
      return json({ items: [{ id: { channelId: "UC1" }, snippet: { title: ARTIST, thumbnails: {} } }] });
    }
    if (url.includes("/channels?")) return json({ items: [{ id: "UC1", snippet: { title: ARTIST, thumbnails: {} } }] });
    return undefined;
  },
  jiosaavn: (url) =>
    url.includes("search.getArtistResults")
      ? text(JSON.stringify({ results: [{ id: "1", name: ARTIST, perma_url: "https://www.jiosaavn.com/artist/1" }] }))
      : undefined,
  kkbox: (url) =>
    url.includes("type=artist")
      ? json({ artists: { data: [{ id: "k1", name: ARTIST, images: [], url: "https://www.kkbox.com/artist/k1" }] } })
      : undefined,
  napster: (url) =>
    url.includes("type=artist") ? json({ search: { data: { artists: [{ id: "art.1", name: ARTIST }] } } }) : undefined,
  netease: (url) =>
    url.includes("/api/search/get") ? json({ result: { artists: [{ id: 1, name: ARTIST }] }, code: 200 }) : undefined,
  qobuz: (url) =>
    url.includes("/artist/search") ? json({ artists: { items: [{ id: 1, name: ARTIST }] } }) : undefined,
  soundcloud: (url) => {
    if (url === "https://soundcloud.com") {
      return text('<script>window.__sc_hydration = [{"hydratable":"apiClient","data":{"id":"cid"}}];</script>');
    }
    if (url.includes("/search/users")) {
      return json({
        collection: [
          { id: 1, username: "slowdive", full_name: ARTIST, permalink_url: "https://soundcloud.com/slowdive" },
        ],
      });
    }
    return undefined;
  },
  deezer: (url) =>
    url.includes("/search/artist")
      ? json({ data: [{ id: 1, name: ARTIST, link: "https://www.deezer.com/artist/1" }] })
      : undefined,
  spotify: (url) =>
    url.includes("type=artist")
      ? json({
          artists: {
            items: [{ id: "s1", name: ARTIST, images: [], genres: [], external_urls: { spotify: "https://x/s1" } }],
          },
        })
      : undefined,
  tidal: (url) =>
    new URL(url).pathname === "/v2/searchResults"
      ? json(tidalSearchDocument("artists", [{ id: "1", attributes: { name: ARTIST } }]))
      : undefined,
  musicbrainz: (url) =>
    url.includes("/artist?query=") ? json({ artists: [{ id: "mbid-1", name: ARTIST, score: 100 }] }) : undefined,
};

const searchingPlugins = listPlugins().filter((plugin) => typeof plugin.adapter.searchArtist === "function");

beforeEach(() => {
  fetchWithTimeoutMock.mockReset();
  vi.stubEnv("APPLE_MUSIC_TOKEN", "static-test-token");
  vi.stubEnv("YOUTUBE_API_KEY", "test-key");
  vi.stubEnv("NAPSTER_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("artist search contract", () => {
  it("has a case for every adapter that searches artists", () => {
    expect(searchingPlugins.length).toBeGreaterThan(0);
    for (const plugin of searchingPlugins) {
      expect(ANSWERS[plugin.manifest.id], plugin.manifest.id).toBeDefined();
    }
  });

  it.each(
    searchingPlugins.map((plugin) => [plugin.manifest.id, plugin] as const),
  )("%s reports a match for an artist whose name is exactly the one searched for", async (id, plugin) => {
    const answer = ANSWERS[id];
    fetchWithTimeoutMock.mockImplementation(
      async (url: string) => answer?.(url) ?? new Response("{}", { status: 404 }),
    );

    const result = await plugin.adapter.searchArtist?.({ name: ARTIST });

    expect(result?.found, id).toBe(true);
    expect(result?.artist?.name, id).toBe(ARTIST);
    expect(result?.confidence ?? 0, id).toBeGreaterThanOrEqual(MATCH_MIN_CONFIDENCE);
  });
});
