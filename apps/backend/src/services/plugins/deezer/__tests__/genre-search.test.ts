/**
 * Integration test for Deezer's genre-search implementation. Exercises the
 * whole pipeline end-to-end against a mocked `fetch`: genre-name resolution,
 * single-endpoint chart fetch, interleave + dedupe, projection into tracks /
 * albums / artists, hot vs. mixed sampling, and the track pool cache.
 *
 * Only `/genre` and `/chart/{id}/tracks` are ever requested — albums and
 * artists are derived from the same track pool (see file header in
 * `plugins/deezer/genre-search.ts` for why).
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

/**
 * Build a fully-typed DeezerChartTrack mock. The embedded `artist` and
 * `album` sub-objects carry the picture/cover URLs we need for the
 * derived artist and album rows — this mirrors the real Deezer response.
 */
function makeTrack(opts: {
  id: number;
  title: string;
  artistId?: number;
  artistName?: string;
  albumId?: number;
  albumTitle?: string;
  explicit?: boolean;
}): unknown {
  const artistId = opts.artistId ?? 100 + opts.id;
  const albumId = opts.albumId ?? 900 + opts.id;
  return {
    id: opts.id,
    title: opts.title,
    duration: 200,
    preview: `https://cdns-preview.dzcdn.net/stream/${opts.id}.mp3`,
    link: `https://www.deezer.com/track/${opts.id}`,
    explicit_lyrics: opts.explicit ?? false,
    artist: {
      id: artistId,
      name: opts.artistName ?? `Artist ${artistId}`,
      link: `https://www.deezer.com/artist/${artistId}`,
      picture_xl: `https://cdn/artist/${artistId}/xl.jpg`,
    },
    album: {
      id: albumId,
      title: opts.albumTitle ?? `Album ${albumId}`,
      link: `https://www.deezer.com/album/${albumId}`,
      cover_xl: `https://cdn/album/${albumId}/xl.jpg`,
    },
  };
}

/**
 * Stand up a `fetch` mock that routes based on URL substring. Only
 * `/genre` (genre list) and `/chart/{id}/tracks` (per-genre track pool)
 * are routed; anything else returns a 500 so a stray request is loud.
 */
function installFetchMock(tracksByGenre: Record<number, unknown[]>): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/genre")) {
      return new Response(JSON.stringify(MOCK_GENRES));
    }
    const chartMatch = /\/chart\/(\d+)\/tracks/.exec(url);
    if (chartMatch) {
      const genreId = Number(chartMatch[1]);
      const items = tracksByGenre[genreId] ?? [];
      return new Response(JSON.stringify({ data: items }));
    }
    return new Response(`not mocked: ${url}`, { status: 500 });
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

  it("returns all three types derived from the single track pool (hot mode)", async () => {
    // Three tracks, three distinct artists, three distinct albums.
    installFetchMock({
      129: Array.from({ length: 3 }, (_, i) =>
        makeTrack({
          id: i + 1,
          title: `Track ${i + 1}`,
          artistId: 10 + i,
          artistName: `Artist ${10 + i}`,
          albumId: 20 + i,
          albumTitle: `Album ${20 + i}`,
        }),
      ),
    });

    const result = await deezerSearchByGenre({
      genres: ["Jazz"],
      vibe: "hot",
      tracks: 3,
      albums: 3,
      artists: 3,
    });

    expect(result.tracks.map((t) => t.sourceId)).toEqual(["1", "2", "3"]);
    expect(result.albums.map((a) => a.sourceId)).toEqual(["20", "21", "22"]);
    expect(result.artists.map((a) => a.sourceId)).toEqual(["10", "11", "12"]);
  });

  it("dedupes artists and albums when the same artist/album appears in multiple tracks", async () => {
    // Six tracks but only three unique artists and three unique albums
    // (artist/album reused round-robin).
    installFetchMock({
      129: [
        makeTrack({ id: 1, title: "A1", artistId: 10, albumId: 20 }),
        makeTrack({ id: 2, title: "B1", artistId: 11, albumId: 21 }),
        makeTrack({ id: 3, title: "C1", artistId: 12, albumId: 22 }),
        makeTrack({ id: 4, title: "A2", artistId: 10, albumId: 20 }), // dup
        makeTrack({ id: 5, title: "B2", artistId: 11, albumId: 21 }), // dup
        makeTrack({ id: 6, title: "C2", artistId: 12, albumId: 22 }), // dup
      ],
    });

    const result = await deezerSearchByGenre({
      genres: ["Jazz"],
      vibe: "hot",
      tracks: 0,
      albums: 10,
      artists: 10,
    });

    expect(result.albums.map((a) => a.sourceId)).toEqual(["20", "21", "22"]);
    expect(result.artists.map((a) => a.sourceId)).toEqual(["10", "11", "12"]);
  });

  it("carries artwork URLs from the nested artist/album refs", async () => {
    installFetchMock({
      129: [makeTrack({ id: 1, title: "Solo", artistId: 10, albumId: 20 })],
    });

    const result = await deezerSearchByGenre({
      genres: ["Jazz"],
      vibe: "hot",
      tracks: 0,
      albums: 1,
      artists: 1,
    });

    expect(result.albums[0].artworkUrl).toBe("https://cdn/album/20/xl.jpg");
    expect(result.artists[0].imageUrl).toBe("https://cdn/artist/10/xl.jpg");
  });

  it("never calls /chart/{id}/albums or /chart/{id}/artists — only the tracks endpoint", async () => {
    const fetchSpy = installFetchMock({
      129: [makeTrack({ id: 1, title: "Solo" })],
    });

    await deezerSearchByGenre({
      genres: ["Jazz"],
      vibe: "hot",
      tracks: 10,
      albums: 10,
      artists: 10,
    });

    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/chart/129/tracks"))).toBe(true);
    expect(urls.some((u) => u.includes("/chart/129/albums"))).toBe(false);
    expect(urls.some((u) => u.includes("/chart/129/artists"))).toBe(false);
  });

  it("makes no chart request at all when nothing is requested", async () => {
    const fetchSpy = installFetchMock({});

    const result = await deezerSearchByGenre({
      genres: ["Jazz"],
      vibe: "hot",
      tracks: 0,
      albums: 0,
      artists: 0,
    });

    expect(result).toEqual({ tracks: [], albums: [], artists: [] });
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    // Genre list isn't touched either — nothing to resolve.
    expect(urls).toEqual([]);
  });

  it("interleaves and dedupes tracks across multiple OR'd genres", async () => {
    // Jazz [t1, t2]; Rock [t2, t3]. Interleave → [t1, t2, t2, t3]; dedupe → [t1, t2, t3].
    installFetchMock({
      129: [makeTrack({ id: 1, title: "t1", artistId: 10 }), makeTrack({ id: 2, title: "t2", artistId: 11 })],
      152: [makeTrack({ id: 2, title: "t2", artistId: 11 }), makeTrack({ id: 3, title: "t3", artistId: 12 })],
    });

    const result = await deezerSearchByGenre({
      genres: ["Jazz", "Rock"],
      vibe: "hot",
      tracks: 10,
      albums: 0,
      artists: 10,
    });

    expect(result.tracks.map((t) => t.sourceId)).toEqual(["1", "2", "3"]);
    expect(result.artists.map((a) => a.sourceId)).toEqual(["10", "11", "12"]);
  });

  it("reuses the cached track pool across calls with the same genre set", async () => {
    const fetchSpy = installFetchMock({
      129: [makeTrack({ id: 1, title: "t1" })],
    });

    await deezerSearchByGenre({ genres: ["Jazz"], vibe: "hot", tracks: 1, albums: 0, artists: 0 });
    await deezerSearchByGenre({ genres: ["Jazz"], vibe: "hot", tracks: 0, albums: 1, artists: 0 });
    await deezerSearchByGenre({ genres: ["Jazz"], vibe: "hot", tracks: 0, albums: 0, artists: 1 });

    const trackCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/chart/129/tracks"));
    expect(trackCalls).toHaveLength(1);
    const genreCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).endsWith("/genre"));
    expect(genreCalls).toHaveLength(1);
  });

  it("vibe=mixed yields different samples on repeat calls against the same pool", async () => {
    const pool = Array.from({ length: 100 }, (_, i) =>
      makeTrack({ id: i + 1, title: `T${i + 1}`, artistId: 300 + i, albumId: 400 + i }),
    );
    installFetchMock({ 129: pool });

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
    // Two independent samples of 9 from a 100-item pool should not coincide.
    expect(first.tracks.map((t) => t.sourceId)).not.toEqual(second.tracks.map((t) => t.sourceId));
  });

  it("always requests the max pool (limit=100) irrespective of requested count", async () => {
    const fetchSpy = installFetchMock({
      129: [makeTrack({ id: 1, title: "t1" })],
    });

    await deezerSearchByGenre({ genres: ["Jazz"], vibe: "hot", tracks: 3, albums: 0, artists: 0 });

    const chartCall = fetchSpy.mock.calls.find((c) => String(c[0]).includes("/chart/129/tracks"));
    expect(String(chartCall?.[0])).toContain("limit=100");
  });

  it("propagates UnknownGenreError when a genre name cannot be resolved", async () => {
    installFetchMock({});

    await expect(
      deezerSearchByGenre({ genres: ["Bebop Noir"], vibe: "hot", tracks: 5, albums: 0, artists: 0 }),
    ).rejects.toThrow(/Unknown genre/);
  });

  it("spreads albums and artists evenly across the pool in hot mode (vs top-N for tracks)", async () => {
    // 20 tracks, each with its own unique artist and album. With the
    // hot-spread clamp `min(100, max(30, 3*count)) = 30` and a pool of 20,
    // the effective range is still 20 → full pool.
    installFetchMock({
      129: Array.from({ length: 20 }, (_, i) =>
        makeTrack({
          id: i + 1,
          title: `Track ${i + 1}`,
          artistId: 10 + i,
          albumId: 100 + i,
        }),
      ),
    });

    const result = await deezerSearchByGenre({
      genres: ["Jazz"],
      vibe: "hot",
      tracks: 10,
      albums: 10,
      artists: 10,
    });

    // Tracks are top-N → pool indices 0..9 → track ids 1..10
    expect(result.tracks.map((t) => t.sourceId)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);

    // Albums + artists are evenly spaced → pool indices 0, 2, 4, …, 18
    // (floor(i * 20 / 10) for i = 0..9)
    expect(result.albums.map((a) => a.sourceId)).toEqual([
      "100",
      "102",
      "104",
      "106",
      "108",
      "110",
      "112",
      "114",
      "116",
      "118",
    ]);
    expect(result.artists.map((a) => a.sourceId)).toEqual(["10", "12", "14", "16", "18", "20", "22", "24", "26", "28"]);
  });

  it("caps hot-mode spread at the top of a large pool to avoid the noisy tail", async () => {
    // 100-item pool: with count=10 the spread range is min(100, max(30, 30)) = 30.
    // So indices are 0, 3, 6, …, 27 — nothing from positions 30-99.
    installFetchMock({
      129: Array.from({ length: 100 }, (_, i) =>
        makeTrack({
          id: i + 1,
          title: `T${i + 1}`,
          artistId: 1000 + i,
          albumId: 2000 + i,
        }),
      ),
    });

    const result = await deezerSearchByGenre({
      genres: ["Jazz"],
      vibe: "hot",
      tracks: 0,
      albums: 10,
      artists: 10,
    });

    // All sourceIds must come from the top-30 range.
    for (const a of result.albums) {
      const id = Number(a.sourceId);
      expect(id).toBeGreaterThanOrEqual(2000);
      expect(id).toBeLessThan(2030);
    }
    // Exact deterministic indices from evenSpacedSample(pool.slice(0,30), 10).
    expect(result.albums.map((a) => a.sourceId)).toEqual([
      "2000",
      "2003",
      "2006",
      "2009",
      "2012",
      "2015",
      "2018",
      "2021",
      "2024",
      "2027",
    ]);
  });

  it("matches 'hip hop' (substring) against Deezer's 'Rap/Hip Hop'", async () => {
    installFetchMock({
      116: [makeTrack({ id: 42, title: "Hit", artistName: "Nas" })],
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
    expect(result.tracks[0].artists).toEqual(["Nas"]);
  });
});
