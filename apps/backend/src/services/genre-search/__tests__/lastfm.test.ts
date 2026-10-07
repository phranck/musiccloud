import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  getStoredArtworkSummaries: vi.fn(),
  cacheAlbumImage: vi.fn(async () => undefined),
}));

vi.mock("../../../lib/infra/fetch.js", () => ({ fetchWithTimeout: mocks.fetchWithTimeout }));
vi.mock("../../genre-artwork/index.js", () => ({ getStoredArtworkSummaries: mocks.getStoredArtworkSummaries }));
vi.mock("../../image-cache.js", () => ({
  cacheAlbumImage: mocks.cacheAlbumImage,
  cacheTrackImage: vi.fn(async () => undefined),
  getArtistImages: vi.fn(async () => new Map()),
  getTrackImages: vi.fn(async () => new Map()),
  trackImageKey: (artist: string, title: string) => `${artist}|${title}`,
}));

import { getGenreBrowseGrid, lastfmSearchByGenre, resetBrowseCache } from "../lastfm.js";

const TOP_TAGS = Array.from({ length: 20 }, (_, index) => ({ name: `genre${index}`, reach: String(1000 - index) }));
const STORED_WITH_COVER = new Set(TOP_TAGS.slice(0, 10).map((tag) => tag.name));
const FORCED_DECADES = 7;

let topTags = TOP_TAGS;
let storedWithCover = STORED_WITH_COVER;

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function lastfmMethod(url: string): string {
  return new URL(url).searchParams.get("method") ?? "";
}

let probesInFlight = 0;
let probePeak = 0;
let probedTags: string[] = [];
let failingTags = new Set<string>();

beforeEach(() => {
  vi.stubEnv("LASTFM_API_KEY", "test-key");
  resetBrowseCache();
  probesInFlight = 0;
  probePeak = 0;
  probedTags = [];
  failingTags = new Set();
  topTags = TOP_TAGS;
  storedWithCover = STORED_WITH_COVER;
  mocks.fetchWithTimeout.mockReset();
  mocks.fetchWithTimeout.mockImplementation(async (url: string) => {
    const method = lastfmMethod(url);
    if (method === "chart.getTopTags") return jsonResponse({ tags: { tag: topTags } });
    if (method === "tag.getTopAlbums") {
      const tag = new URL(url).searchParams.get("tag") ?? "";
      probedTags.push(tag);
      probesInFlight++;
      probePeak = Math.max(probePeak, probesInFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      probesInFlight--;
      if (failingTags.has(tag)) throw new Error("Last.fm throttled");
      return jsonResponse({
        albums: {
          album: [
            {
              name: `${tag} album`,
              artist: { name: `${tag} artist` },
              image: [{ size: "extralarge", "#text": `https://img/${tag}.jpg` }],
            },
          ],
        },
      });
    }
    throw new Error(`unexpected request: ${method}`);
  });
  mocks.getStoredArtworkSummaries.mockReset();
  mocks.getStoredArtworkSummaries.mockImplementation(async (keys: string[]) => {
    const summaries = new Map<string, { accentColor: string; hasSourceCover: boolean }>();
    for (const key of keys) {
      if (storedWithCover.has(key)) summaries.set(key, { accentColor: "#abcdef", hasSourceCover: true });
    }
    return summaries;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getGenreBrowseGrid", () => {
  it("probes only genres without a stored cover artwork, a bounded number at a time", async () => {
    const tiles = await getGenreBrowseGrid();

    expect(tiles).toHaveLength(TOP_TAGS.length + FORCED_DECADES);
    expect(probedTags.filter((tag) => STORED_WITH_COVER.has(tag))).toEqual([]);
    expect(probedTags).toHaveLength(TOP_TAGS.length - STORED_WITH_COVER.size + FORCED_DECADES);
    expect(probePeak).toBeGreaterThan(1);
    expect(probePeak).toBeLessThanOrEqual(8);
  });

  it("does not probe genres below the point where stored covers already fill the grid", async () => {
    topTags = Array.from({ length: 300 }, (_, index) => ({ name: `tag${index}`, reach: String(10_000 - index) }));
    storedWithCover = new Set(topTags.filter((_, index) => index !== 3 && index !== 270).map((tag) => tag.name));

    const tiles = await getGenreBrowseGrid();

    expect(probedTags).toEqual(["tag3"]);
    expect(tiles).toHaveLength(250);
    expect(tiles.map((tile) => tile.name)).toContain("tag3");
    expect(tiles.map((tile) => tile.name)).not.toContain("tag250");
  });

  it("inlines the stored accent on the tile", async () => {
    const tiles = await getGenreBrowseGrid();

    expect(tiles.find((tile) => tile.name === "genre0")?.accentColor).toBe("#abcdef");
    expect(tiles.find((tile) => tile.name === "genre15")?.accentColor).toBeUndefined();
  });

  it("rebuilds a grid that lost tiles to failed probes after minutes instead of a day", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    failingTags = new Set(["genre12", "genre13"]);
    const degraded = await getGenreBrowseGrid();
    expect(degraded.map((tile) => tile.name)).not.toContain("genre12");

    failingTags = new Set();
    now.mockReturnValue(1_000_000 + 5 * 60 * 1000 + 1);
    const rebuilt = await getGenreBrowseGrid();

    expect(rebuilt.map((tile) => tile.name)).toContain("genre12");
  });

  it("keeps a complete grid for longer than the degraded window", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    await getGenreBrowseGrid();
    const requestsAfterBuild = mocks.fetchWithTimeout.mock.calls.length;

    now.mockReturnValue(1_000_000 + 60 * 60 * 1000);
    await getGenreBrowseGrid();

    expect(mocks.fetchWithTimeout.mock.calls.length).toBe(requestsAfterBuild);
  });

  it("probes every genre when the stored artworks cannot be read", async () => {
    mocks.getStoredArtworkSummaries.mockRejectedValue(new Error("database unavailable"));

    const tiles = await getGenreBrowseGrid();

    expect(tiles).toHaveLength(TOP_TAGS.length + FORCED_DECADES);
    expect(probedTags).toHaveLength(TOP_TAGS.length + FORCED_DECADES);
  });
});

describe("lastfmSearchByGenre", () => {
  it("answers without waiting for the album cache writes", async () => {
    mocks.cacheAlbumImage.mockImplementation(() => new Promise<undefined>(() => {}));

    const result = await lastfmSearchByGenre({ genres: ["shoegaze"], vibe: "hot", tracks: 0, albums: 1, artists: 0 });

    expect(result.albums.map((album) => album.title)).toEqual(["shoegaze album"]);
    expect(mocks.cacheAlbumImage).toHaveBeenCalledWith(
      "shoegaze artist",
      "shoegaze album",
      "https://img/shoegaze.jpg",
      "lastfm",
    );
  });
});
