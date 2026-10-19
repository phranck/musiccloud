import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamUnavailableError } from "../../../../lib/infra/upstream-unavailable";
import { jiosaavnAdapter } from "../adapter";
import recordedAlbumDetails from "./fixtures/album-id-metadata.json";
import recordedPunctuatedSearch from "./fixtures/album-punctuated-search.json";
import recordedAlbumSearch from "./fixtures/album-search-current.json";
import recordedUnknownAlbum from "./fixtures/album-token-current.json";
import recordedAlbumToken from "./fixtures/album-token-v4.json";
import recordedArtistV4 from "./fixtures/artist-v4-metadata.json";

afterEach(() => {
  vi.restoreAllMocks();
});

/** What JioSaavn answers with HTTP 200 for a call it refuses. */
const REFUSED_CALL = { error: { code: "INPUT_INVALID", msg: "notExist operation is not supported" } };

// =============================================================================
// detectUrl
// =============================================================================

describe("JioSaavn: detectUrl", () => {
  it("should extract track ID from standard URL", () => {
    expect(jiosaavnAdapter.detectUrl("https://www.jiosaavn.com/song/blinding-lights/Fj9GfAxDWUY")).toBe("Fj9GfAxDWUY");
  });

  it("should extract track ID without www", () => {
    expect(jiosaavnAdapter.detectUrl("https://jiosaavn.com/song/test-song/ABC123")).toBe("ABC123");
  });

  it("should return null for non-song URL", () => {
    expect(jiosaavnAdapter.detectUrl("https://www.jiosaavn.com/album/test-album")).toBeNull();
  });

  it("should return null for non-JioSaavn URL", () => {
    expect(jiosaavnAdapter.detectUrl("https://open.spotify.com/track/abc123")).toBeNull();
  });
});

// =============================================================================
// getTrack
// =============================================================================

describe("JioSaavn: getTrack", () => {
  it("should fetch and map song data", async () => {
    const mockSong = {
      id: "Fj9GfAxDWUY",
      title: "Blinding Lights",
      perma_url: "https://www.jiosaavn.com/song/blinding-lights/Fj9GfAxDWUY",
      image: "https://c.saavncdn.com/150x150.jpg",
      more_info: {
        duration: "200",
        album: "After Hours",
        artistMap: {
          primary_artists: [{ name: "The Weeknd", id: "123" }],
        },
        explicit_content: "0",
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ songs: [mockSong] }), { status: 200 }),
    );

    const track = await jiosaavnAdapter.getTrack("Fj9GfAxDWUY");
    expect(track.sourceService).toBe("jiosaavn");
    expect(track.title).toBe("Blinding Lights");
    expect(track.artists).toEqual(["The Weeknd"]);
    expect(track.albumName).toBe("After Hours");
    expect(track.durationMs).toBe(200000);
  });

  // A token JioSaavn does not know answers an empty list.
  it("should throw not found for a token JioSaavn does not know", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("[]", { status: 200 }));
    await expect(jiosaavnAdapter.getTrack("invalid")).rejects.toThrow("Track not found");
  });

  it("should throw an outage for an HTML page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<!DOCTYPE html>", { status: 200 }));
    await expect(jiosaavnAdapter.getTrack("invalid")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it("should throw on an error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 503 }));
    await expect(jiosaavnAdapter.getTrack("Fj9GfAxDWUY")).rejects.toThrow(/503/);
  });
});

// =============================================================================
// getAlbum
// =============================================================================

describe("JioSaavn: getAlbum", () => {
  it("resolves a public URL token to its catalog id before reading complete album metadata", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const params = new URL(String(input)).searchParams;
      if (params.get("__call") === "webapi.get" && params.get("type") === "album")
        return Response.json(recordedAlbumToken);
      return Response.json(params.get("albumid") === "1527849" ? recordedAlbumDetails : recordedUnknownAlbum);
    });
    await expect(jiosaavnAdapter.getAlbum?.("fZKfu-Ey4oA_")).resolves.toMatchObject({
      sourceId: "1527849",
      title: "Singing Today's Hits! - Vol. 1",
      artists: ["Karaoke Idols"],
      releaseDate: recordedAlbumDetails.release_date,
      webUrl: recordedAlbumDetails.perma_url,
    });
  });

  // Recorded from content.getAlbumDetails for album 56783991: the endpoint sends
  // albumid, name and a comma-separated primary_artists string, with no id.
  const recordedAlbum = {
    albumid: "56783991",
    name: "Oohalu Gusagusalade (Original Motion Picture Soundtrack)",
    title: "Oohalu Gusagusalade (Original Motion Picture Soundtrack)",
    primary_artists: "Kalyani Mallik, Anantha Sreeram, Sirivennela Sitaramasastri",
    primary_artists_id: "24621128, 456746, 471153",
    release_date: "2014-04-28",
    year: "2014",
    perma_url: "https://www.jiosaavn.com/album/oohalu-gusagusalade-original-motion-picture-soundtrack/dst9nfCun0o_",
    image: "https://c.saavncdn.com/243/Oohalu-Gusagusalade-Telugu-2014-20240802162328-150x150.jpg",
    songs: [
      {
        id: "ePGTQOwd",
        song: "Emiti Hadavidi",
        duration: "206",
        album: "Oohalu Gusagusalade (Original Motion Picture Soundtrack)",
        perma_url: "https://www.jiosaavn.com/song/emiti-hadavidi/FTgsZSV-QFc",
        image: "https://c.saavncdn.com/243/Oohalu-Gusagusalade-Telugu-2014-20240802162328-150x150.jpg",
      },
      {
        id: "0jCD42P-",
        song: "Inthakante Vere",
        duration: "235",
        album: "Oohalu Gusagusalade (Original Motion Picture Soundtrack)",
        perma_url: "https://www.jiosaavn.com/song/inthakante-vere/QAIodUACZx4",
        image: "https://c.saavncdn.com/243/Oohalu-Gusagusalade-Telugu-2014-20240802162328-150x150.jpg",
      },
    ],
  };

  it("maps the album endpoint's actual shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(recordedAlbum), { status: 200 }));

    const album = await jiosaavnAdapter.getAlbum!("56783991");
    expect(album.sourceId).toBe("56783991");
    expect(album.title).toBe("Oohalu Gusagusalade (Original Motion Picture Soundtrack)");
    expect(album.artists).toEqual(["Kalyani Mallik", "Anantha Sreeram", "Sirivennela Sitaramasastri"]);
    expect(album.releaseDate).toBe("2014-04-28");
    expect(album.webUrl).toBe(recordedAlbum.perma_url);
    expect(album.tracks?.map((track) => track.title)).toEqual(recordedAlbum.songs.map((song) => song.song));
    expect(album.tracks?.[0]?.durationMs).toBe(Number(recordedAlbum.songs[0].duration) * 1000);
    expect(album.totalTracks).toBe(2);
  });

  it("leaves out a song that has neither a title nor a song name", async () => {
    const withBlankSong = { ...recordedAlbum, songs: [{ id: "x1", duration: "100" }, recordedAlbum.songs[0]] };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(withBlankSong), { status: 200 }));

    const album = await jiosaavnAdapter.getAlbum!("56783991");
    expect(album.tracks?.map((track) => track.title)).toEqual([recordedAlbum.songs[0].song]);
  });

  it("returns a not-found error for an album the endpoint does not answer with an id or name", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

    await expect(jiosaavnAdapter.getAlbum!("1")).rejects.toThrow("Album not found");
  });
});

// =============================================================================
// searchTrack
// =============================================================================

describe("JioSaavn: searchTrack", () => {
  it("should find track with structured query", async () => {
    const mockResults = {
      results: [
        {
          id: "Fj9GfAxDWUY",
          title: "Blinding Lights",
          perma_url: "https://www.jiosaavn.com/song/blinding-lights/Fj9GfAxDWUY",
          image: "https://c.saavncdn.com/500x500.jpg",
          more_info: {
            duration: "200",
            album: "After Hours",
            artistMap: { primary_artists: [{ name: "The Weeknd", id: "123" }] },
          },
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(mockResults), { status: 200 }));

    const result = await jiosaavnAdapter.searchTrack({ title: "Blinding Lights", artist: "The Weeknd" });
    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Blinding Lights");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 0, start: 1, results: [] }), { status: 200 }),
    );

    const result = await jiosaavnAdapter.searchTrack({ title: "Nonexistent", artist: "Nobody" });
    expect(result.found).toBe(false);
  });

  /**
   * A search that did not run is an outage. Answering "not found" would make
   * the resolver record a miss and skip JioSaavn for that track for a month.
   */
  it("should throw on an error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 500 }));

    await expect(jiosaavnAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/500/);
  });

  it("should throw on an HTML page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<!DOCTYPE html>", { status: 200 }));

    await expect(jiosaavnAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it("should throw on a body that is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Too many requests", { status: 200 }));

    await expect(jiosaavnAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it("does not copy arbitrary provider error payload content into diagnostics", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ error: { code: "INPUT_INVALID", msg: "test-only-sensitive-detail" } }),
    );
    const error: unknown = await jiosaavnAdapter
      .searchTrack({ title: "Test", artist: "Test" })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(UpstreamUnavailableError);
    expect(error).toMatchObject({ message: expect.stringContaining("INPUT_INVALID") });
    expect(error).not.toMatchObject({ message: expect.stringContaining("test-only-sensitive-detail") });
  });

  it("should throw when JioSaavn refuses the call with an error object", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(REFUSED_CALL));

    await expect(jiosaavnAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/INPUT_INVALID/);
  });

  it("should throw when the answer has no results list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ total: 0 }));

    await expect(jiosaavnAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it("should throw when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Outbound request failed"));

    await expect(jiosaavnAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(
      "Outbound request failed",
    );
  });
});

// =============================================================================
// searchAlbum
// =============================================================================

describe("JioSaavn: searchAlbum", () => {
  it("tries one punctuation-normalized alternative while retaining the requested volume and metadata", async () => {
    const query = { title: "Singing Today's Hits! - Vol. 1", artist: "Karaoke Idols" };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const params = new URL(String(input)).searchParams;
      if (params.get("__call") === "content.getAlbumDetails") return Response.json(recordedAlbumDetails);
      return Response.json(
        params.get("q") === "Karaoke Idols Singing Today's Hits Vol 1" ? recordedAlbumSearch : recordedPunctuatedSearch,
      );
    });
    const result = await jiosaavnAdapter.searchAlbum?.(query);
    expect(result?.found).toBe(true);
    expect(result?.album).toMatchObject({ sourceId: "1527849", title: query.title, artists: [query.artist] });
    expect(query.title).toBe("Singing Today's Hits! - Vol. 1");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("uses the current album search artist map to identify the existing release", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const operation = new URL(String(input)).searchParams.get("__call");
      return Response.json(operation === "search.getAlbumResults" ? recordedAlbumSearch : recordedAlbumDetails);
    });
    const result = await jiosaavnAdapter.searchAlbum?.({
      title: "Singing Today's Hits! - Vol. 1",
      artist: "Karaoke Idols",
    });
    expect(result?.found).toBe(true);
    expect(result?.album).toMatchObject({
      sourceId: "1527849",
      title: "Singing Today's Hits! - Vol. 1",
      artists: ["Karaoke Idols"],
    });
  });

  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 0, start: 1, results: [] }), { status: 200 }),
    );

    const result = await jiosaavnAdapter.searchAlbum?.({ title: "Nonexistent", artist: "Nobody" });
    expect(result?.found).toBe(false);
  });

  it("should throw on an error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 502 }));

    await expect(jiosaavnAdapter.searchAlbum?.({ title: "Test", artist: "Test" })).rejects.toThrow(/502/);
  });

  it("should throw when JioSaavn refuses the call", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(REFUSED_CALL));

    await expect(jiosaavnAdapter.searchAlbum?.({ title: "Test", artist: "Test" })).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it("should throw when the details of a candidate album cannot be fetched", async () => {
    const searchAnswer = {
      results: [{ id: "56783991", title: "Hunting High and Low", perma_url: "https://www.jiosaavn.com/album/x/y" }],
    };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(searchAnswer))
      .mockResolvedValueOnce(new Response("<!DOCTYPE html>", { status: 200 }));

    await expect(
      jiosaavnAdapter.searchAlbum?.({ title: "Hunting High and Low", artist: "Hunting High and Low" }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

// =============================================================================
// getArtist / searchArtist
// =============================================================================

describe("JioSaavn: getArtist", () => {
  it("requests the current artist contract and retains its canonical overview URL", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const version = new URL(String(input)).searchParams.get("api_version");
      return version === "4" ? Response.json(recordedArtistV4) : new Response("", { status: 500 });
    });
    await expect(jiosaavnAdapter.getArtist?.("LmR4m2rZchQ_")).resolves.toMatchObject({
      sourceId: "1273866",
      name: "Karaoke Idols",
      webUrl: "https://www.jiosaavn.com/artist/karaoke-idols/LmR4m2rZchQ_",
    });
  });

  it("should fetch and map artist data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        artistId: "615155",
        name: "The Weeknd",
        image: "https://c.saavncdn.com/artists/The_Weeknd_150x150.jpg",
        perma_url: "https://www.jiosaavn.com/artist/the-weeknd-songs/FJRb7GbYWrQ_",
      }),
    );

    const artist = await jiosaavnAdapter.getArtist?.("FJRb7GbYWrQ_");
    expect(artist?.name).toBe("The Weeknd");
    expect(artist?.sourceId).toBe("615155");
  });

  // A token JioSaavn does not know answers HTTP 200 with an empty body.
  it("should throw not found for an empty body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 200 }));

    await expect(jiosaavnAdapter.getArtist?.("zzzzzzzzzzz")).rejects.toThrow("Artist not found");
  });

  it("should throw not found for an artist without an id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ artistId: null, name: "" }));

    await expect(jiosaavnAdapter.getArtist?.("Nonexistent123")).rejects.toThrow("Artist not found");
  });

  it("should throw an outage for an HTML page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<!DOCTYPE html>", { status: 200 }));

    await expect(jiosaavnAdapter.getArtist?.("FJRb7GbYWrQ_")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

describe("JioSaavn: searchArtist", () => {
  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 0, start: 1, results: [] }), { status: 200 }),
    );

    const result = await jiosaavnAdapter.searchArtist?.({ name: "Nobody" });
    expect(result?.found).toBe(false);
  });

  it("should throw on an error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 429 }));

    await expect(jiosaavnAdapter.searchArtist?.({ name: "Test" })).rejects.toThrow(/429/);
  });

  it("should throw when JioSaavn refuses the call", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(REFUSED_CALL));

    await expect(jiosaavnAdapter.searchArtist?.({ name: "Test" })).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

// =============================================================================
// Metadata
// =============================================================================

describe("JioSaavn: adapter metadata", () => {
  it("should have correct id", () => {
    expect(jiosaavnAdapter.id).toBe("jiosaavn");
  });
  it("should have correct displayName", () => {
    expect(jiosaavnAdapter.displayName).toBe("JioSaavn");
  });
  it("should not support ISRC", () => {
    expect(jiosaavnAdapter.capabilities.supportsIsrc).toBe(false);
  });
});
