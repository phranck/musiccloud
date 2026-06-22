import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCcAlbum,
  getCcAlbumTracks,
  getCcArtist,
  getCcArtistMusicInfo,
  getCcArtistsByIds,
  getCcArtistTopTracks,
  getCcGenreCoverUrl,
  getCcGenres,
  getCcTrack,
  getSimilarCcTracks,
  searchCcTracks,
} from "../client.js";
import type { JamendoAlbumRaw, JamendoArtistRaw, JamendoEnvelope, JamendoTrackRaw } from "../types.js";

const SAMPLE_TRACK: JamendoTrackRaw = {
  id: "1886393",
  name: "Sample Title",
  duration: 180,
  artist_id: "338723",
  artist_name: "Sample Artist",
  album_id: "176136",
  album_name: "Sample Album",
  album_image: "https://usercontent.jamendo.com/album.jpg",
  image: "https://usercontent.jamendo.com/track.jpg",
  audio: "https://prod-1.storage.jamendo.com/?trackid=1886393&format=mp31",
  audiodownload: "https://prod-1.storage.jamendo.com/download/track/1886393/mp32/",
  audiodownload_allowed: true,
  license_ccurl: "http://creativecommons.org/licenses/by-nc-nd/3.0/",
  shareurl: "https://www.jamendo.com/track/1886393",
  waveform: '{"peaks":[0,12,40,255]}',
  releasedate: "2020-05-01",
};

function mockJamendo(body: JamendoEnvelope<JamendoTrackRaw>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response),
  );
}

describe("searchCcTracks", () => {
  beforeEach(() => {
    vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps a Jamendo track to a CcTrack (seconds → ms, license, stream, waveform)", async () => {
    mockJamendo({
      headers: { status: "success", code: 0, results_count: 1 },
      results: [SAMPLE_TRACK],
    });

    const tracks = await searchCcTracks({ search: "sample" });

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      jamendoId: "1886393",
      title: "Sample Title",
      artistName: "Sample Artist",
      jamendoArtistId: "338723",
      albumName: "Sample Album",
      durationMs: 180000,
      licenseCcurl: "http://creativecommons.org/licenses/by-nc-nd/3.0/",
      streamUrl: "https://prod-1.storage.jamendo.com/?trackid=1886393&format=mp31",
      downloadAllowed: true,
      waveform: '{"peaks":[0,12,40,255]}',
    });
  });

  it("decodes HTML entities in track title / artist / album (Jamendo returns them raw)", async () => {
    mockJamendo({
      headers: { status: "success", code: 0, results_count: 1 },
      results: [
        { ...SAMPLE_TRACK, name: "R&amp;B Jam", artist_name: "Bessonn&amp;sa", album_name: "Best &#39;n More" },
      ],
    });

    const tracks = await searchCcTracks({ tags: "rnb" });

    expect(tracks[0]).toMatchObject({ title: "R&B Jam", artistName: "Bessonn&sa", albumName: "Best 'n More" });
  });

  it("passes client_id and structured fields to the request URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 0 }, results: [] }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await searchCcTracks({ name: "Enjoy The Silence", artist_name: "Depeche Mode", limit: 5 });

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("client_id=test_client_id");
    expect(calledUrl).toContain("name=Enjoy+The+Silence");
    expect(calledUrl).toContain("artist_name=Depeche+Mode");
    expect(calledUrl).toContain("limit=5");
  });

  it("throws when JAMENDO_CLIENT_ID is missing", async () => {
    vi.unstubAllEnvs();
    await expect(searchCcTracks({ search: "x" })).rejects.toThrow(/JAMENDO_CLIENT_ID/);
  });

  it("throws when the API reports a failed status", async () => {
    mockJamendo({
      headers: { status: "failed", code: 1, error_message: "boom", results_count: 0 },
      results: [],
    });
    await expect(searchCcTracks({ search: "x" })).rejects.toThrow(/boom/);
  });
});

describe("getCcTrack", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the single mapped track for an id", async () => {
    mockJamendo({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] });
    const track = await getCcTrack("1886393");
    expect(track?.jamendoId).toBe("1886393");
    expect(track?.streamUrl).toContain("trackid=1886393");
  });

  it("returns null when no track matches", async () => {
    mockJamendo({ headers: { status: "success", code: 0, results_count: 0 }, results: [] });
    const track = await getCcTrack("does-not-exist");
    expect(track).toBeNull();
  });
});

describe("getSimilarCcTracks", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reads the seed's genre tags then fuzzy-tag searches similar tracks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          headers: { status: "success", code: 0, results_count: 1 },
          results: [{ ...SAMPLE_TRACK, musicinfo: { tags: { genres: ["jazz", "piano"] } } }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const similar = await getSimilarCcTracks("1886393");

    expect(String(fetchMock.mock.calls[0][0])).toContain("id=1886393");
    expect(String(fetchMock.mock.calls[0][0])).toContain("include=musicinfo");
    expect(String(fetchMock.mock.calls[1][0])).toContain("fuzzytags=jazz");
    expect(similar[0]?.jamendoId).toBe("1886393");
  });

  it("returns [] without a second call when the seed has no genre tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    expect(await getSimilarCcTracks("1886393")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("getCcAlbumTracks", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requests /tracks filtered by album_id and maps the rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const tracks = await getCcAlbumTracks("176136");

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/tracks");
    expect(calledUrl).toContain("album_id=176136");
    expect(tracks[0]?.jamendoId).toBe("1886393");
  });
});

describe("getCcArtistTopTracks", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requests /tracks filtered by artist_id ordered by popularity", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const tracks = await getCcArtistTopTracks("338723");

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("artist_id=338723");
    expect(calledUrl).toContain("order=popularity_total");
    expect(tracks[0]?.jamendoId).toBe("1886393");
  });
});

const SAMPLE_ALBUM: JamendoAlbumRaw = {
  id: "176136",
  name: "Sample Album",
  artist_id: "338723",
  artist_name: "Sample Artist",
  image: "https://usercontent.jamendo.com/album.jpg",
  releasedate: "2020-05-01",
  zip: "https://prod-1.storage.jamendo.com/download/album/176136/mp32/",
  shareurl: "https://www.jamendo.com/album/176136",
};

const SAMPLE_ARTIST: JamendoArtistRaw = {
  id: "338723",
  name: "Sample Artist",
  website: "https://example.org",
  image: "https://usercontent.jamendo.com/artist.jpg",
  shareurl: "https://www.jamendo.com/artist/338723",
};

describe("getCcAlbum", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps a Jamendo album to a CcAlbum", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_ALBUM] }),
      } as Response),
    );
    const album = await getCcAlbum("176136");
    expect(album).toMatchObject({
      jamendoId: "176136",
      name: "Sample Album",
      jamendoArtistId: "338723",
      zipUrl: SAMPLE_ALBUM.zip,
    });
  });
});

describe("getCcArtist", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps a Jamendo artist to a CcArtist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_ARTIST] }),
      } as Response),
    );
    const artist = await getCcArtist("338723");
    expect(artist).toMatchObject({ jamendoId: "338723", name: "Sample Artist", website: "https://example.org" });
  });
});

describe("getCcArtistMusicInfo", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function mockArtist(artist: JamendoArtistRaw): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [artist] }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("requests /artists with include=musicinfo and maps image + genres + bio", async () => {
    const fetchMock = mockArtist({
      ...SAMPLE_ARTIST,
      musicinfo: { tags: ["jazz", "piano"], description: { en: "An English bio." } },
    });

    const info = await getCcArtistMusicInfo("338723");

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/artists");
    expect(calledUrl).toContain("id=338723");
    expect(calledUrl).toContain("include=musicinfo");
    expect(info).toEqual({
      imageUrl: "https://usercontent.jamendo.com/artist.jpg",
      genres: ["jazz", "piano"],
      bioSummary: "An English bio.",
    });
  });

  it("caps genres at 3", async () => {
    mockArtist({
      ...SAMPLE_ARTIST,
      musicinfo: { tags: ["jazz", "piano", "blues", "soul", "funk"] },
    });

    const info = await getCcArtistMusicInfo("338723");

    expect(info?.genres).toEqual(["jazz", "piano", "blues"]);
  });

  it("prefers the requested locale's bio over English", async () => {
    mockArtist({
      ...SAMPLE_ARTIST,
      musicinfo: { description: { en: "English bio.", de: "Deutsche Bio." } },
    });

    const info = await getCcArtistMusicInfo("338723", "de");

    expect(info?.bioSummary).toBe("Deutsche Bio.");
  });

  it("falls back to the English bio when the requested locale is missing", async () => {
    mockArtist({
      ...SAMPLE_ARTIST,
      musicinfo: { description: { en: "English bio." } },
    });

    const info = await getCcArtistMusicInfo("338723", "de");

    expect(info?.bioSummary).toBe("English bio.");
  });

  it("yields a null bio when neither the locale nor English is present", async () => {
    mockArtist({
      ...SAMPLE_ARTIST,
      musicinfo: { tags: ["jazz"], description: { fr: "Bio française." } },
    });

    const info = await getCcArtistMusicInfo("338723");

    expect(info?.bioSummary).toBeNull();
    expect(info?.genres).toEqual(["jazz"]);
  });

  it("yields null image / empty genres / null bio when musicinfo is absent", async () => {
    mockArtist({ ...SAMPLE_ARTIST, image: "" });

    const info = await getCcArtistMusicInfo("338723");

    expect(info).toEqual({ imageUrl: null, genres: [], bioSummary: null });
  });

  it("returns null when Jamendo has no record for the id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ headers: { status: "success", code: 0, results_count: 0 }, results: [] }),
      } as Response),
    );

    expect(await getCcArtistMusicInfo("does-not-exist")).toBeNull();
  });
});

describe("getCcArtistsByIds", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requests /artists with a '+'-joined id list and maps the rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        headers: { status: "success", code: 0, results_count: 2 },
        results: [SAMPLE_ARTIST, { ...SAMPLE_ARTIST, id: "999", name: "Other" }],
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const artists = await getCcArtistsByIds(["338723", "999"]);

    // URLSearchParams encodes the '+' separator as %2B; Jamendo accepts that as
    // a multi-id list (verified live), so the wire form carries %2B, not '+'.
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/artists");
    expect(calledUrl).toContain("id=338723%2B999");
    expect(artists.map((a) => a.jamendoId)).toEqual(["338723", "999"]);
  });

  it("short-circuits to [] without a request for an empty id list", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await getCcArtistsByIds([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getCcGenres", () => {
  it("returns the curated CC genre set with human display labels", async () => {
    const genres = await getCcGenres();

    expect(genres.length).toBeGreaterThanOrEqual(40);
    // Sampled entries: lowercase Jamendo tag → human display label.
    expect(genres).toContainEqual({ name: "jazz", displayName: "Jazz" });
    expect(genres).toContainEqual({ name: "hiphop", displayName: "Hip Hop" });
    expect(genres).toContainEqual({ name: "drumnbass", displayName: "Drum & Bass" });
    // Editorial mixes / non-genres must never appear as a clickable tile.
    expect(genres.some((g) => g.name === "bestof")).toBe(false);
  });

  it("exposes unique, non-empty, lowercase Jamendo tags", async () => {
    const genres = await getCcGenres();
    const names = genres.map((g) => g.name);

    expect(new Set(names).size).toBe(names.length);
    for (const g of genres) {
      expect(g.name).toMatch(/^[a-z]+$/);
      expect(g.displayName.length).toBeGreaterThan(0);
    }
  });
});

describe("getCcGenreCoverUrl", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the top track's album cover from /tracks (genre tags filter tracks, not albums)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const url = await getCcGenreCoverUrl("jazz");

    expect(url).toBe(SAMPLE_TRACK.image);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/tracks");
    expect(calledUrl).toContain("tags=jazz");
    expect(calledUrl).toContain("order=popularity_total");
    expect(calledUrl).toContain("imagesize=600");
    expect(calledUrl).toContain("limit=1");
  });

  it("falls back to album_image when the top track has no image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          headers: { status: "success", code: 0, results_count: 1 },
          results: [{ ...SAMPLE_TRACK, image: "" }],
        }),
      } as Response),
    );

    expect(await getCcGenreCoverUrl("jazz")).toBe(SAMPLE_TRACK.album_image);
  });

  it("returns null when Jamendo returned no track", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ headers: { status: "success", code: 0, results_count: 0 }, results: [] }),
      } as Response),
    );

    expect(await getCcGenreCoverUrl("doesnotexist")).toBeNull();
  });
});
