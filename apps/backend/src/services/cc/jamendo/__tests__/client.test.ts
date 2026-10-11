import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithTimeoutMock = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
}));

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
  JamendoUnavailableError,
  searchCcTracks,
} from "../client.js";
import type { JamendoAlbumRaw, JamendoArtistRaw, JamendoEnvelope, JamendoTrackRaw } from "../types.js";

/** The global `fetch` bypasses the outbound address policy, so any call to it fails the test. */
const globalFetchMock = vi.fn(() => {
  throw new Error("The Jamendo client called the global fetch.");
});

beforeEach(() => {
  fetchWithTimeoutMock.mockReset();
  globalFetchMock.mockClear();
  vi.stubGlobal("fetch", globalFetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  expect(globalFetchMock).not.toHaveBeenCalled();
});

/**
 * The URL of one request the client sent.
 *
 * @param call - Zero-based index of the request.
 * @returns The requested URL as a string.
 */
function requestedUrl(call = 0): string {
  return String(fetchWithTimeoutMock.mock.calls[call]?.[0]);
}

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
  fetchWithTimeoutMock.mockResolvedValue({
    ok: true,
    json: async () => body,
  } as Response);
}

describe("searchCcTracks", () => {
  beforeEach(() => {
    vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id");
  });
  afterEach(() => {
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
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        headers: { status: "success", code: 0, results_count: 0, results_fullcount: 0 },
        results: [],
      }),
    } as Response);

    await searchCcTracks({ name: "Enjoy The Silence", artist_name: "Depeche Mode", limit: 5 });

    const calledUrl = requestedUrl();
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
    vi.unstubAllEnvs();
  });

  it("returns the single mapped track for an id", async () => {
    mockJamendo({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] });
    const track = await getCcTrack("1886393");
    expect(track?.jamendoId).toBe("1886393");
    expect(track?.streamUrl).toContain("trackid=1886393");
  });

  it("returns null when no track matches", async () => {
    mockJamendo({ headers: { status: "success", code: 0, results_count: 0, results_fullcount: 0 }, results: [] });
    const track = await getCcTrack("does-not-exist");
    expect(track).toBeNull();
  });
});

/** Jamendo's faulty `/tracks` answer: empty, reported as success, without `results_fullcount`. */
const FAULTY_EMPTY_TRACKS: JamendoEnvelope<JamendoTrackRaw> = {
  headers: { status: "success", code: 0, results_count: 0 },
  results: [],
};

/** A healthy `/tracks` answer carrying one row whose genre tags also seed a similarity search. */
const HEALTHY_TRACKS: JamendoEnvelope<JamendoTrackRaw> = {
  headers: { status: "success", code: 0, results_count: 1, results_fullcount: 1 },
  results: [{ ...SAMPLE_TRACK, musicinfo: { tags: { genres: ["jazz"] } } }],
};

/**
 * Answers the client's requests with a sequence of Jamendo envelopes, one per
 * request. The last envelope repeats once the sequence is used up.
 *
 * @param bodies - The envelopes to answer with, in request order.
 */
function mockJamendoSequence(...bodies: JamendoEnvelope<JamendoTrackRaw>[]): void {
  for (const body of bodies) {
    fetchWithTimeoutMock.mockResolvedValueOnce({ ok: true, json: async () => body } as Response);
  }
  fetchWithTimeoutMock.mockResolvedValue({ ok: true, json: async () => bodies[bodies.length - 1] } as Response);
}

describe("faulty empty /tracks answers", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requests fullcount so a healthy answer can be told apart from a faulty one", async () => {
    mockJamendoSequence(HEALTHY_TRACKS);

    await getCcTrack("1886393");

    expect(requestedUrl()).toContain("fullcount=true");
  });

  it("repeats an empty answer without results_fullcount and returns the next healthy one", async () => {
    mockJamendoSequence(FAULTY_EMPTY_TRACKS, FAULTY_EMPTY_TRACKS, HEALTHY_TRACKS);

    const track = await getCcTrack("1886393");

    expect(track?.jamendoId).toBe("1886393");
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(3);
  });

  it("accepts a genuine miss carrying results_fullcount 0 without repeating it", async () => {
    mockJamendoSequence({
      headers: { status: "success", code: 0, results_count: 0, results_fullcount: 0 },
      results: [],
    });

    expect(await getCcTrack("does-not-exist")).toBeNull();
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
  });

  it("throws JamendoUnavailableError when no attempt brings a healthy answer", async () => {
    mockJamendoSequence(FAULTY_EMPTY_TRACKS);

    await expect(getCcTrack("1886393")).rejects.toBeInstanceOf(JamendoUnavailableError);
    expect(fetchWithTimeoutMock.mock.calls.length).toBeGreaterThan(1);
  });

  it.each([
    ["searchCcTracks", () => searchCcTracks({ search: "sample" })],
    ["getCcAlbumTracks", () => getCcAlbumTracks("176136")],
    ["getCcArtistTopTracks", () => getCcArtistTopTracks("338723")],
    ["getSimilarCcTracks", () => getSimilarCcTracks("1886393")],
    ["getCcGenreCoverUrl", () => getCcGenreCoverUrl("jazz").then((url) => (url ? [url] : []))],
  ])("%s recovers from a faulty empty answer", async (_name, call) => {
    mockJamendoSequence(FAULTY_EMPTY_TRACKS, HEALTHY_TRACKS);

    expect(await call()).toHaveLength(1);
  });
});

describe("getSimilarCcTracks", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the seed's genre tags then fuzzy-tag searches similar tracks", async () => {
    fetchWithTimeoutMock
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

    const similar = await getSimilarCcTracks("1886393");

    expect(requestedUrl(0)).toContain("id=1886393");
    expect(requestedUrl(0)).toContain("include=musicinfo");
    expect(requestedUrl(1)).toContain("fuzzytags=jazz");
    expect(similar[0]?.jamendoId).toBe("1886393");
  });

  it("returns [] without a second call when the seed has no genre tags", async () => {
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] }),
    } as Response);

    expect(await getSimilarCcTracks("1886393")).toEqual([]);
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
  });
});

describe("getCcAlbumTracks", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requests /tracks filtered by album_id and maps the rows", async () => {
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] }),
    } as Response);

    const tracks = await getCcAlbumTracks("176136");

    const calledUrl = requestedUrl();
    expect(calledUrl).toContain("/tracks");
    expect(calledUrl).toContain("album_id=176136");
    expect(tracks[0]?.jamendoId).toBe("1886393");
  });
});

describe("getCcArtistTopTracks", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requests /tracks filtered by artist_id ordered by popularity", async () => {
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] }),
    } as Response);

    const tracks = await getCcArtistTopTracks("338723");

    const calledUrl = requestedUrl();
    expect(calledUrl).toContain("artist_id=338723");
    expect(calledUrl).toContain("order=popularity_total");
    expect(tracks[0]?.jamendoId).toBe("1886393");
  });
});

describe("Jamendo request timeout", () => {
  beforeEach(() => {
    vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id");
    vi.stubEnv("JAMENDO_REQUEST_TIMEOUT_MS", "50");
    // The timeout is read once at module load, so each test takes a fresh module.
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * Rejects the way `fetchWithTimeout` does once its timer fires, both while
   * waiting for the answer and while reading it.
   *
   * @param timeoutMs - The limit the client passed to `fetchWithTimeout`.
   * @returns A promise rejecting with an `AbortError` after `timeoutMs`.
   */
  function abortAfter(timeoutMs: number): Promise<never> {
    return new Promise((_resolve, reject) => {
      setTimeout(() => reject(new DOMException("This operation was aborted", "AbortError")), timeoutMs);
    });
  }

  function albumAnswer(): Response {
    return {
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_ALBUM] }),
    } as Response;
  }

  it("bounds every request by the configured timeout", async () => {
    const client = await import("../client.js");
    fetchWithTimeoutMock.mockResolvedValue(albumAnswer());

    await client.getCcAlbum("176136");

    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(expect.stringContaining("/albums?"), {}, 50);
  });

  it("ends a request Jamendo never answers and lets the next queued request run", async () => {
    const client = await import("../client.js");
    fetchWithTimeoutMock
      .mockImplementationOnce((_url: string, _init: RequestInit, timeoutMs: number) => abortAfter(timeoutMs))
      .mockResolvedValue(albumAnswer());

    const stalled = client.getCcAlbum("1");
    const queued = client.getCcAlbum("176136");

    await expect(stalled).rejects.toMatchObject({
      name: "JamendoUnavailableError",
      message: "Jamendo did not answer within 50 ms",
    });
    expect((await queued)?.jamendoId).toBe("176136");
  });

  it("ends a request whose answer stops arriving while it is read", async () => {
    const client = await import("../client.js");
    fetchWithTimeoutMock.mockImplementation(async (_url: string, _init: RequestInit, timeoutMs: number) => ({
      ok: true,
      json: () => abortAfter(timeoutMs),
    }));

    await expect(client.getCcAlbum("1")).rejects.toMatchObject({
      name: "JamendoUnavailableError",
      message: "Jamendo did not answer within 50 ms",
    });
  });

  it("reports a request that failed for another reason as unreachable rather than slow", async () => {
    const client = await import("../client.js");
    fetchWithTimeoutMock.mockRejectedValue(new Error("Blocked non-public outbound target"));

    await expect(client.getCcAlbum("1")).rejects.toMatchObject({
      name: "JamendoUnavailableError",
      message: "Jamendo could not be reached",
    });
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
    vi.unstubAllEnvs();
  });

  it("maps a Jamendo album to a CcAlbum", async () => {
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_ALBUM] }),
    } as Response);
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
    vi.unstubAllEnvs();
  });

  it("maps a Jamendo artist to a CcArtist", async () => {
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_ARTIST] }),
    } as Response);
    const artist = await getCcArtist("338723");
    expect(artist).toMatchObject({ jamendoId: "338723", name: "Sample Artist", website: "https://example.org" });
  });
});

describe("getCcArtistMusicInfo", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function mockArtist(artist: JamendoArtistRaw): void {
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [artist] }),
    } as Response);
  }

  it("requests the /artists/musicinfo endpoint and maps image + genres + bio", async () => {
    mockArtist({
      ...SAMPLE_ARTIST,
      musicinfo: { tags: ["jazz", "piano"], description: { en: "An English bio." } },
    });

    const info = await getCcArtistMusicInfo("338723");

    const calledUrl = requestedUrl();
    expect(calledUrl).toContain("/artists/musicinfo");
    expect(calledUrl).toContain("id=338723");
    // The raw Jamendo description is normalized to safe paragraph HTML via
    // jamendoBioToHtml before it reaches the frontend's MarkdownHtml pipeline.
    expect(info).toEqual({
      imageUrl: "https://usercontent.jamendo.com/artist.jpg",
      genres: ["jazz", "piano"],
      bioSummary: "<p>An English bio.</p>",
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

    expect(info?.bioSummary).toBe("<p>Deutsche Bio.</p>");
  });

  it("falls back to the English bio when the requested locale is missing", async () => {
    mockArtist({
      ...SAMPLE_ARTIST,
      musicinfo: { description: { en: "English bio." } },
    });

    const info = await getCcArtistMusicInfo("338723", "de");

    expect(info?.bioSummary).toBe("<p>English bio.</p>");
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

  it("yields null when the artist record carries no image, genres, or bio", async () => {
    mockArtist({ ...SAMPLE_ARTIST, image: "" });

    const info = await getCcArtistMusicInfo("338723");

    // Nothing worth showing -> "no profile" so the artist card self-hides.
    expect(info).toBeNull();
  });

  it("returns null when Jamendo has no record for the id", async () => {
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 0 }, results: [] }),
    } as Response);

    expect(await getCcArtistMusicInfo("does-not-exist")).toBeNull();
  });
});

describe("getCcArtistsByIds", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requests /artists with a '+'-joined id list and maps the rows", async () => {
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        headers: { status: "success", code: 0, results_count: 2 },
        results: [SAMPLE_ARTIST, { ...SAMPLE_ARTIST, id: "999", name: "Other" }],
      }),
    } as Response);

    const artists = await getCcArtistsByIds(["338723", "999"]);

    // URLSearchParams encodes the '+' separator as %2B; Jamendo accepts that as
    // a multi-id list (verified live), so the wire form carries %2B, not '+'.
    const calledUrl = requestedUrl();
    expect(calledUrl).toContain("/artists");
    expect(calledUrl).toContain("id=338723%2B999");
    expect(artists.map((a) => a.jamendoId)).toEqual(["338723", "999"]);
  });

  it("short-circuits to [] without a request for an empty id list", async () => {
    expect(await getCcArtistsByIds([])).toEqual([]);
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
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
    vi.unstubAllEnvs();
  });

  it("returns the top track's album cover from /tracks (genre tags filter tracks, not albums)", async () => {
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] }),
    } as Response);

    const url = await getCcGenreCoverUrl("jazz");

    expect(url).toBe(SAMPLE_TRACK.image);
    const calledUrl = requestedUrl();
    expect(calledUrl).toContain("/tracks");
    expect(calledUrl).toContain("tags=jazz");
    expect(calledUrl).toContain("order=popularity_total");
    expect(calledUrl).toContain("imagesize=600");
    expect(calledUrl).toContain("limit=1");
  });

  it("falls back to album_image when the top track has no image", async () => {
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        headers: { status: "success", code: 0, results_count: 1 },
        results: [{ ...SAMPLE_TRACK, image: "" }],
      }),
    } as Response);

    expect(await getCcGenreCoverUrl("jazz")).toBe(SAMPLE_TRACK.album_image);
  });

  it("returns null when Jamendo returned no track", async () => {
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        headers: { status: "success", code: 0, results_count: 0, results_fullcount: 0 },
        results: [],
      }),
    } as Response);

    expect(await getCcGenreCoverUrl("doesnotexist")).toBeNull();
  });
});
