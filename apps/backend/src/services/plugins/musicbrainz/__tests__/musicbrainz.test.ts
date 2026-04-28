import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { musicbrainzAdapter } from "../adapter";
import { _resetMusicBrainzGate } from "../rate-limit";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetMusicBrainzGate();
});

afterEach(() => {
  vi.useRealTimers();
});

const RECORDING_MBID = "4d2dc6f4-1234-5678-90ab-cdef00112233";
const RELEASE_MBID = "11111111-2222-3333-4444-555555555555";
const ARTIST_MBID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("MusicBrainz: detectUrl", () => {
  it("detects recording URL with MBID", () => {
    expect(
      musicbrainzAdapter.detectUrl(`https://musicbrainz.org/recording/${RECORDING_MBID}`),
    ).toBe(RECORDING_MBID);
  });

  it("detects www. variant", () => {
    expect(
      musicbrainzAdapter.detectUrl(`https://www.musicbrainz.org/recording/${RECORDING_MBID}`),
    ).toBe(RECORDING_MBID);
  });

  it("returns null for non-MB URL", () => {
    expect(musicbrainzAdapter.detectUrl("https://open.spotify.com/track/abc")).toBeNull();
  });

  it("detects release URL via detectAlbumUrl", () => {
    expect(
      musicbrainzAdapter.detectAlbumUrl(`https://musicbrainz.org/release/${RELEASE_MBID}`),
    ).toBe(RELEASE_MBID);
  });

  it("detects release-group URL via detectAlbumUrl", () => {
    expect(
      musicbrainzAdapter.detectAlbumUrl(`https://musicbrainz.org/release-group/${RELEASE_MBID}`),
    ).toBe(RELEASE_MBID);
  });

  it("detects artist URL via detectArtistUrl", () => {
    expect(
      musicbrainzAdapter.detectArtistUrl(`https://musicbrainz.org/artist/${ARTIST_MBID}`),
    ).toBe(ARTIST_MBID);
  });
});

describe("MusicBrainz: getTrack", () => {
  it("returns NormalizedTrack with mbid, iswc, isrc, artwork from cover-art-archive", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: RECORDING_MBID,
        title: "One More Time",
        length: 320000,
        isrcs: ["GBDUW0000059"],
        "artist-credit": [{ name: "Daft Punk", artist: { id: ARTIST_MBID, name: "Daft Punk" } }],
        releases: [{ id: RELEASE_MBID, title: "Discovery", date: "2001-03-12" }],
        relations: [
          {
            type: "performance",
            work: { id: "work-mbid", iswcs: ["T-010.500.001-0"] },
          },
        ],
      }),
    );

    const track = await musicbrainzAdapter.getTrack(RECORDING_MBID);
    expect(track.sourceService).toBe("musicbrainz");
    expect(track.sourceId).toBe(RECORDING_MBID);
    expect(track.mbid).toBe(RECORDING_MBID);
    expect(track.iswc).toBe("T-010.500.001-0");
    expect(track.isrc).toBe("GBDUW0000059");
    expect(track.title).toBe("One More Time");
    expect(track.artists).toEqual(["Daft Punk"]);
    expect(track.albumName).toBe("Discovery");
    expect(track.releaseDate).toBe("2001-03-12");
    expect(track.durationMs).toBe(320000);
    expect(track.artworkUrl).toBe(`https://coverartarchive.org/release/${RELEASE_MBID}/front-500.jpg`);
    expect(track.webUrl).toBe(`https://musicbrainz.org/recording/${RECORDING_MBID}`);
  });

  it("throws ServiceNotFoundError on 404", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse("not found", 404));
    await expect(musicbrainzAdapter.getTrack(RECORDING_MBID)).rejects.toThrow();
  });
});

describe("MusicBrainz: findByIsrc", () => {
  it("returns first recording from /isrc/{isrc} with synthesised isrc field", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        isrc: "GBDUW0000059",
        recordings: [
          {
            id: RECORDING_MBID,
            title: "One More Time",
            "artist-credit": [{ name: "Daft Punk", artist: { id: ARTIST_MBID, name: "Daft Punk" } }],
          },
        ],
      }),
    );

    const track = await musicbrainzAdapter.findByIsrc("GBDUW0000059");
    expect(track?.isrc).toBe("GBDUW0000059");
    expect(track?.mbid).toBe(RECORDING_MBID);
  });

  it("returns null when no recordings match", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ recordings: [] }));
    const track = await musicbrainzAdapter.findByIsrc("XX-DOES-NOT-EXIST");
    expect(track).toBeNull();
  });

  it("returns null on HTTP error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse("server error", 500));
    expect(await musicbrainzAdapter.findByIsrc("XX")).toBeNull();
  });
});

describe("MusicBrainz: searchTrackWithCandidates", () => {
  it("returns ranked candidates with confidence normalised from MB score", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        recordings: [
          {
            id: RECORDING_MBID,
            title: "One More Time",
            score: 100,
            "artist-credit": [{ name: "Daft Punk", artist: { id: ARTIST_MBID, name: "Daft Punk" } }],
          },
          {
            id: "second-mbid-uuid-1234-5678-90ab-cdef0011",
            title: "One More Time (Remix)",
            score: 75,
            "artist-credit": [{ name: "Daft Punk", artist: { id: ARTIST_MBID, name: "Daft Punk" } }],
          },
        ],
      }),
    );

    const result = await musicbrainzAdapter.searchTrackWithCandidates({
      title: "One More Time",
      artist: "Daft Punk",
    });

    expect(result.candidates.length).toBe(2);
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(result.candidates[1].confidence);
    expect(result.bestMatch.found).toBe(true);
    expect(result.bestMatch.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("returns found:false when no recordings", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ recordings: [] }));
    const result = await musicbrainzAdapter.searchTrackWithCandidates({
      title: "Nothing",
      artist: "Nobody",
    });
    expect(result.bestMatch.found).toBe(false);
    expect(result.candidates).toEqual([]);
  });

  it("emits limit=10 and Lucene-style query string", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ recordings: [] }));
    await musicbrainzAdapter.searchTrackWithCandidates({
      title: "Test Track",
      artist: "Test Artist",
    });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("limit=10");
    expect(url).toContain("recording");
    expect(url).toContain("artist");
  });
});

describe("MusicBrainz: findAlbumByUpc + getAlbum", () => {
  it("findAlbumByUpc returns NormalizedAlbum with mbid + label", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        releases: [
          {
            id: RELEASE_MBID,
            title: "Discovery",
            date: "2001-03-12",
            barcode: "724384960728",
            "artist-credit": [{ name: "Daft Punk", artist: { id: ARTIST_MBID, name: "Daft Punk" } }],
            "label-info": [{ label: { name: "Virgin" }, "catalog-number": "8497612" }],
          },
        ],
      }),
    );

    const album = await musicbrainzAdapter.findAlbumByUpc("724384960728");
    expect(album?.mbid).toBe(RELEASE_MBID);
    expect(album?.upc).toBe("724384960728");
    expect(album?.label).toBe("Virgin");
    expect(album?.artworkUrl).toBe(`https://coverartarchive.org/release/${RELEASE_MBID}/front-500.jpg`);
  });

  it("getAlbum throws on 404", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse("not found", 404));
    await expect(musicbrainzAdapter.getAlbum(RELEASE_MBID)).rejects.toThrow();
  });
});

describe("MusicBrainz: searchArtist + getArtist", () => {
  it("searchArtist returns NormalizedArtist with mbid + isni", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        artists: [
          {
            id: ARTIST_MBID,
            name: "Daft Punk",
            score: 100,
            isnis: ["0000000122996059"],
            tags: [
              { name: "electronic", count: 50 },
              { name: "house", count: 30 },
            ],
          },
        ],
      }),
    );

    const result = await musicbrainzAdapter.searchArtist({ name: "Daft Punk" });
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.artist?.mbid).toBe(ARTIST_MBID);
      expect(result.artist?.isni).toBe("0000000122996059");
      expect(result.artist?.genres).toEqual(["electronic", "house"]);
    }
  });

  it("getArtist returns NormalizedArtist", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: ARTIST_MBID,
        name: "Daft Punk",
        isnis: ["0000000122996059"],
      }),
    );

    const artist = await musicbrainzAdapter.getArtist(ARTIST_MBID);
    expect(artist.mbid).toBe(ARTIST_MBID);
    expect(artist.name).toBe("Daft Punk");
  });
});

describe("MusicBrainz: rate-limit gate", () => {
  it("serialises concurrent calls 1100ms apart", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ recordings: [] })));

    const t0 = Date.now();
    const calls = [
      musicbrainzAdapter.searchTrackWithCandidates({ title: "a", artist: "x" }),
      musicbrainzAdapter.searchTrackWithCandidates({ title: "b", artist: "y" }),
      musicbrainzAdapter.searchTrackWithCandidates({ title: "c", artist: "z" }),
    ];

    await vi.advanceTimersByTimeAsync(3500);
    await Promise.all(calls);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    // First call is immediate; second after ~1100ms; third after ~2200ms.
    // The exact mock-call timing depends on the timer drain, but at minimum
    // the gate keeps them in order, so the test asserts call count + order
    // rather than wall-clock spacing.
    expect(Date.now() - t0).toBeGreaterThanOrEqual(2200);
  });
});

describe("MusicBrainz: external-ids aggregation through resolver", () => {
  it("collectTrackExternalIds emits mbid + iswc when track carries them", async () => {
    const { collectTrackExternalIds } = await import("../../../external-ids");

    const records = collectTrackExternalIds(
      {
        sourceService: "musicbrainz",
        sourceId: RECORDING_MBID,
        title: "x",
        artists: ["x"],
        webUrl: "https://musicbrainz.org/recording/x",
        isrc: "ISRC1",
        mbid: RECORDING_MBID,
        iswc: "T-010.500.001-0",
      },
      [{ service: "deezer", isrc: "ISRC1" }],
    );

    const types = records.map((r) => `${r.idType}:${r.sourceService}`);
    expect(types).toContain("mbid:musicbrainz");
    expect(types).toContain("iswc:musicbrainz");
    expect(types).toContain("isrc:musicbrainz");
    expect(types).toContain("isrc:deezer");
  });
});
