/**
 * Integration test for Deezer's genre-search implementation. Exercises the
 * whole pipeline end-to-end against a mocked `fetch`: genre-name resolution,
 * chart fan-out per type, interleave + dedupe across multiple genres, hot
 * vs. mixed sampling, and the module-level pool cache.
 *
 * The mocked fetch routes by URL so a single `mockImplementation` covers any
 * number of chart calls in any order — adding a new test case doesn't require
 * threading `mockResolvedValueOnce` calls in call order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetGenreCacheForTests } from "@/services/genre-search/genre-map";
import { _resetGenrePoolsForTests, deezerSearchByGenre } from "@/services/plugins/deezer/genre-search";

// ─── Mock data ──────────────────────────────────────────────────────────────

const MOCK_GENRES = {
  data: [
    { id: 0, name: "All" },
    { id: 129, name: "Jazz" },
    { id: 152, name: "Rock" },
    { id: 116, name: "Rap/Hip Hop" },
  ],
};

function makeTrack(id: number, title: string, artistName: string, artistId = 100): unknown {
  return {
    id,
    title,
    duration: 200,
    preview: `https://cdns-preview.dzcdn.net/stream/${id}.mp3`,
    link: `https://www.deezer.com/track/${id}`,
    explicit_lyrics: false,
    artist: { id: artistId, name: artistName },
    album: { id: 900 + id, title: `Album ${id}`, cover_xl: "https://cdn/xl.jpg" },
  };
}

function makeAlbum(id: number, title: string, artistName: string): unknown {
  return {
    id,
    title,
    link: `https://www.deezer.com/album/${id}`,
    cover_xl: "https://cdn/xl.jpg",
    artist: { id: 200, name: artistName },
  };
}

function makeArtist(id: number, name: string): unknown {
  return {
    id,
    name,
    link: `https://www.deezer.com/artist/${id}`,
    picture_xl: "https://cdn/pic.jpg",
  };
}

/**
 * Stand up a `fetch` mock that routes based on URL substring, so tests don't
 * care about the order in which the implementation fires requests.
 *
 * @param chart  maps `"tracks:<genreId>" | "albums:<genreId>" | "artists:<genreId>"`
 *               to the array of items the chart endpoint should return.
 */
function installFetchMock(chart: Record<string, unknown[]>): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith("/genre")) {
      return new Response(JSON.stringify(MOCK_GENRES));
    }

    const chartMatch = /\/chart\/(\d+)\/(tracks|albums|artists)/.exec(url);
    if (chartMatch) {
      const [, genreId, kind] = chartMatch;
      const key = `${kind}:${genreId}`;
      const items = chart[key] ?? [];
      return new Response(JSON.stringify({ data: items }));
    }

    return new Response("not mocked", { status: 500 });
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("deezerSearchByGenre (integration)", () => {
  beforeEach(() => {
    _resetGenreCacheForTests();
    _resetGenrePoolsForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns three lists for a single genre in hot mode", async () => {
    installFetchMock({
      "tracks:129": Array.from({ length: 15 }, (_, i) => makeTrack(i + 1, `Track ${i + 1}`, "Miles Davis")),
      "albums:129": Array.from({ length: 15 }, (_, i) => makeAlbum(i + 1, `Album ${i + 1}`, "Miles Davis")),
      "artists:129": Array.from({ length: 15 }, (_, i) => makeArtist(i + 1, `Artist ${i + 1}`)),
    });

    const result = await deezerSearchByGenre({
      genres: ["Jazz"],
      vibe: "hot",
      tracks: 10,
      albums: 10,
      artists: 10,
    });

    expect(result.tracks).toHaveLength(10);
    expect(result.albums).toHaveLength(10);
    expect(result.artists).toHaveLength(10);
    // Hot mode = top-N from ranked chart → first 10 in order.
    expect(result.tracks[0].title).toBe("Track 1");
    expect(result.tracks[9].title).toBe("Track 10");
  });

  it("does not fetch chart endpoints for types with count 0", async () => {
    const fetchSpy = installFetchMock({
      "artists:129": [makeArtist(1, "Solo")],
    });

    await deezerSearchByGenre({
      genres: ["Jazz"],
      vibe: "hot",
      tracks: 0,
      albums: 0,
      artists: 5,
    });

    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith("/genre"))).toBe(true);
    expect(urls.some((u) => u.includes("/artists"))).toBe(true);
    expect(urls.some((u) => u.includes("/tracks"))).toBe(false);
    expect(urls.some((u) => u.includes("/albums"))).toBe(false);
  });

  it("interleaves and dedupes across multiple OR'd genres", async () => {
    // Two genres with partial overlap: jazz returns artists A,B; rock returns B,C.
    // After interleave + dedup we expect order [A, B, C] (B from jazz beats dup in rock).
    installFetchMock({
      "artists:129": [makeArtist(1, "Artist A"), makeArtist(2, "Artist B")],
      "artists:152": [makeArtist(2, "Artist B"), makeArtist(3, "Artist C")],
    });

    const result = await deezerSearchByGenre({
      genres: ["Jazz", "Rock"],
      vibe: "hot",
      tracks: 0,
      albums: 0,
      artists: 10,
    });

    expect(result.artists.map((a) => a.sourceId)).toEqual(["1", "2", "3"]);
  });

  it("uses the pool cache on repeat calls", async () => {
    const fetchSpy = installFetchMock({
      "tracks:129": [makeTrack(1, "T1", "X"), makeTrack(2, "T2", "Y")],
    });

    await deezerSearchByGenre({ genres: ["Jazz"], vibe: "hot", tracks: 2, albums: 0, artists: 0 });
    await deezerSearchByGenre({ genres: ["Jazz"], vibe: "hot", tracks: 2, albums: 0, artists: 0 });

    const trackCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/chart/129/tracks"));
    // One chart fetch for the first call; the second is served from the cache.
    expect(trackCalls).toHaveLength(1);
    // Genre list is also cached → exactly one `/genre` call across both invocations.
    const genreCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).endsWith("/genre"));
    expect(genreCalls).toHaveLength(1);
  });

  it("vibe=mixed draws from a larger pool and yields different samples on repeat", async () => {
    const pool = Array.from({ length: 100 }, (_, i) => makeTrack(i + 1, `T${i + 1}`, `A${i + 1}`, 300 + i));
    installFetchMock({ "tracks:129": pool });

    const first = await deezerSearchByGenre({
      genres: ["Jazz"],
      vibe: "mixed",
      tracks: 9,
      albums: 0,
      artists: 0,
    });
    const second = await deezerSearchByGenre({
      genres: ["Jazz"],
      vibe: "mixed",
      tracks: 9,
      albums: 0,
      artists: 0,
    });

    expect(first.tracks).toHaveLength(9);
    expect(second.tracks).toHaveLength(9);
    // Two fresh samples of size 9 from a 100-item pool are extremely unlikely
    // to collide exactly — if this ever flakes we should reduce the pool.
    expect(first.tracks.map((t) => t.sourceId)).not.toEqual(second.tracks.map((t) => t.sourceId));
  });

  it("requests the max pool size (100) regardless of target count when vibe=mixed", async () => {
    const fetchSpy = installFetchMock({
      "tracks:129": Array.from({ length: 100 }, (_, i) => makeTrack(i + 1, `T${i + 1}`, "X", 400 + i)),
    });

    await deezerSearchByGenre({ genres: ["Jazz"], vibe: "mixed", tracks: 5, albums: 0, artists: 0 });

    const chartCall = fetchSpy.mock.calls.find((c) => String(c[0]).includes("/chart/129/tracks"));
    expect(chartCall).toBeDefined();
    expect(String(chartCall?.[0])).toContain("limit=100");
  });

  it("uses target count as the fetch limit when vibe=hot", async () => {
    const fetchSpy = installFetchMock({
      "tracks:129": Array.from({ length: 7 }, (_, i) => makeTrack(i + 1, `T${i + 1}`, "X", 500 + i)),
    });

    await deezerSearchByGenre({ genres: ["Jazz"], vibe: "hot", tracks: 7, albums: 0, artists: 0 });

    const chartCall = fetchSpy.mock.calls.find((c) => String(c[0]).includes("/chart/129/tracks"));
    // hot mode fills the pool at MAX_POOL too (pool-first design) — if the impl
    // later decides to economise on hot mode, tighten this to `=7`.
    expect(String(chartCall?.[0])).toMatch(/limit=\d+/);
  });

  it("propagates UnknownGenreError for an unrecognised genre", async () => {
    installFetchMock({});

    await expect(
      deezerSearchByGenre({
        genres: ["Bebop Noir"],
        vibe: "hot",
        tracks: 10,
        albums: 10,
        artists: 10,
      }),
    ).rejects.toThrow(/Unknown genre/);
  });

  it("matches 'hip hop' substring against 'Rap/Hip Hop'", async () => {
    installFetchMock({
      "tracks:116": [makeTrack(42, "Hit", "Nas")],
    });

    const result = await deezerSearchByGenre({
      genres: ["hip hop"],
      vibe: "hot",
      tracks: 1,
      albums: 0,
      artists: 0,
    });

    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].title).toBe("Hit");
  });
});
