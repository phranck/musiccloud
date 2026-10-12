import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../../../../lib/infra/fetch";
import { UpstreamUnavailableError } from "../../../../lib/infra/upstream-unavailable";
import { neteaseAdapter } from "../adapter";

vi.mock("../../../../lib/infra/fetch", () => ({ fetchWithTimeout: vi.fn() }));

afterEach(() => {
  vi.resetAllMocks();
});

/** NetEase's refusal of a call its risk control rejects, answered with HTTP 200. */
const RISK_CONTROL_REFUSAL = { code: -462, data: { blockText: "verify" }, message: "verify" };

describe("NetEase: detectUrl", () => {
  it("should extract song ID from standard URL", () => {
    expect(neteaseAdapter.detectUrl("https://music.163.com/song?id=123456")).toBe("123456");
  });

  it("should extract song ID from hash URL", () => {
    expect(neteaseAdapter.detectUrl("https://music.163.com/#/song?id=789012")).toBe("789012");
  });

  it("should return null for non-song URL", () => {
    expect(neteaseAdapter.detectUrl("https://music.163.com/album?id=123")).toBeNull();
  });

  it("should return null for non-NetEase URL", () => {
    expect(neteaseAdapter.detectUrl("https://open.spotify.com/track/abc")).toBeNull();
  });
});

describe("NetEase: getTrack", () => {
  // Shaped like `/api/song/detail`, which describes a song with `artists`,
  // `album` and `duration` like a search does.
  it("should fetch and map track data", async () => {
    const mockResponse = {
      songs: [
        {
          id: 123456,
          name: "Take on Me",
          artists: [{ id: 1, name: "a-ha" }],
          album: { id: 10, name: "Hunting High and Low", picUrl: "https://p1.music.126.net/test.jpg" },
          duration: 225000,
        },
      ],
      code: 200,
    };

    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

    const track = await neteaseAdapter.getTrack("123456");
    expect(track.sourceService).toBe("netease");
    expect(track.title).toBe("Take on Me");
    expect(track.artists).toEqual(["a-ha"]);
    expect(track.albumName).toBe("Hunting High and Low");
    expect(track.durationMs).toBe(225000);
    expect(track.artworkUrl).toBe("https://p1.music.126.net/test.jpg");
  });

  it("should throw not found for an id NetEase does not have", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(Response.json({ songs: [], equalizers: {}, code: 200 }));
    await expect(neteaseAdapter.getTrack("invalid")).rejects.toThrow("Track not found");
  });

  it("should throw on an error status", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    await expect(neteaseAdapter.getTrack("123456")).rejects.toThrow(/404/);
  });

  it("should throw when NetEase refuses the call", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(Response.json(RISK_CONTROL_REFUSAL));
    await expect(neteaseAdapter.getTrack("123456")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

describe("NetEase: searchTrack", () => {
  it("should find track with search API", async () => {
    const mockSearch = {
      result: {
        songs: [
          {
            id: 123456,
            name: "Take on Me",
            artists: [{ id: 1, name: "a-ha" }],
            album: { id: 10, name: "Hunting High and Low" },
            duration: 225000,
          },
        ],
        songCount: 1,
      },
      code: 200,
    };

    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response(JSON.stringify(mockSearch), { status: 200 }));

    const result = await neteaseAdapter.searchTrack({ title: "Take on Me", artist: "a-ha" });
    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Take on Me");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("should return not found for empty results", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      new Response(JSON.stringify({ result: { songs: [], songCount: 0 }, code: 200 }), { status: 200 }),
    );

    const result = await neteaseAdapter.searchTrack({ title: "Nonexistent", artist: "Nobody" });
    expect(result.found).toBe(false);
  });

  // NetEase answers a track search without matches with no `songs` key at all.
  it("should return not found when the result carries only a count of 0", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(Response.json({ result: { songCount: 0 }, code: 200 }));

    const result = await neteaseAdapter.searchTrack({ title: "Nonexistent", artist: "Nobody" });
    expect(result.found).toBe(false);
  });

  /**
   * A search that did not run is an outage. Answering "not found" would make
   * the resolver record a miss and skip NetEase for that track for a month.
   */
  it("should throw on an error status", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response("Error", { status: 500 }));

    await expect(neteaseAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/500/);
  });

  it("should throw on a body that is not JSON", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response("<html>maintenance</html>", { status: 200 }));

    await expect(neteaseAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it("should throw when NetEase refuses the call with a non-200 code", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(Response.json(RISK_CONTROL_REFUSAL));

    await expect(neteaseAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/-462/);
  });

  it("should throw when the answer has no result", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(Response.json({ code: 200 }));

    await expect(neteaseAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it("should throw when the request fails", async () => {
    vi.mocked(fetchWithTimeout).mockRejectedValueOnce(new Error("Outbound request failed"));

    await expect(neteaseAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(
      "Outbound request failed",
    );
  });
});

describe("NetEase: searchAlbum", () => {
  it("should return not found for empty results", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      Response.json({ result: { hlWords: null, albums: [], albumCount: 0 }, code: 200 }),
    );

    const result = await neteaseAdapter.searchAlbum?.({ title: "Nonexistent", artist: "Nobody" });
    expect(result?.found).toBe(false);
  });

  it("should throw on an error status", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response("Error", { status: 503 }));

    await expect(neteaseAdapter.searchAlbum?.({ title: "Test", artist: "Test" })).rejects.toThrow(/503/);
  });

  it("should throw when NetEase refuses the call", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(Response.json(RISK_CONTROL_REFUSAL));

    await expect(neteaseAdapter.searchAlbum?.({ title: "Test", artist: "Test" })).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });
});

describe("NetEase: searchArtist", () => {
  it("should return not found for empty results", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      Response.json({ result: { hasMore: false, artistCount: 0, artists: [] }, code: 200 }),
    );

    const result = await neteaseAdapter.searchArtist?.({ name: "Nobody" });
    expect(result?.found).toBe(false);
  });

  it("should throw on an error status", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response("Error", { status: 502 }));

    await expect(neteaseAdapter.searchArtist?.({ name: "Test" })).rejects.toThrow(/502/);
  });

  it("should throw when NetEase refuses the call", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(Response.json(RISK_CONTROL_REFUSAL));

    await expect(neteaseAdapter.searchArtist?.({ name: "Test" })).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

describe("NetEase: getAlbum", () => {
  it("should fetch and map album data", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      Response.json({
        album: { id: 1520298, name: "Hunting High and Low", artists: [{ id: 85546, name: "a-ha" }], size: 10 },
        code: 200,
      }),
    );

    const album = await neteaseAdapter.getAlbum?.("1520298");
    expect(album?.title).toBe("Hunting High and Low");
    expect(album?.artists).toEqual(["a-ha"]);
    expect(album?.totalTracks).toBe(10);
  });

  it("should throw not found when NetEase answers code 404", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(Response.json({ code: 404 }));

    await expect(neteaseAdapter.getAlbum?.("999999999")).rejects.toThrow("Album not found");
  });

  it("should throw an outage, not not found, when NetEase refuses the call", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(Response.json(RISK_CONTROL_REFUSAL));

    await expect(neteaseAdapter.getAlbum?.("1520298")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

describe("NetEase: getArtist", () => {
  it("should fetch and map artist data", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      Response.json({ artist: { id: 85546, name: "a-ha", picUrl: "https://p1.music.126.net/a.jpg" }, code: 200 }),
    );

    const artist = await neteaseAdapter.getArtist?.("85546");
    expect(artist?.name).toBe("a-ha");
    expect(artist?.imageUrl).toBe("https://p1.music.126.net/a.jpg");
  });

  it("should throw not found when NetEase answers code 404", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(Response.json({ code: 404 }));

    await expect(neteaseAdapter.getArtist?.("999999999")).rejects.toThrow("Artist not found");
  });

  it("should throw on an error status", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response("Error", { status: 500 }));

    await expect(neteaseAdapter.getArtist?.("85546")).rejects.toThrow(/500/);
  });
});

describe("NetEase: adapter metadata", () => {
  it("should have correct id", () => {
    expect(neteaseAdapter.id).toBe("netease");
  });
  it("should have correct displayName", () => {
    expect(neteaseAdapter.displayName).toBe("NetEase Cloud Music");
  });
  it("should not support ISRC", () => {
    expect(neteaseAdapter.capabilities.supportsIsrc).toBe(false);
  });
});
