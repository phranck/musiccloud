import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamUnavailableError } from "../../../../lib/infra/upstream-unavailable";
import { qqmusicAdapter } from "../adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("QQ Music: detectUrl", () => {
  it("should extract mid from standard URL", () => {
    expect(qqmusicAdapter.detectUrl("https://y.qq.com/n/ryqq/songDetail/001BLpXF2DyJe2")).toBe("001BLpXF2DyJe2");
  });

  it("should return null for non-song URL", () => {
    expect(qqmusicAdapter.detectUrl("https://y.qq.com/n/ryqq/albumDetail/123")).toBeNull();
  });

  it("should return null for non-QQ URL", () => {
    expect(qqmusicAdapter.detectUrl("https://open.spotify.com/track/abc")).toBeNull();
  });
});

describe("QQ Music: searchTrack", () => {
  // Shaped like QQ Music's answer on 2026-10-12: the envelope and the module
  // both carry `code: 0` when the search ran.
  it("should find track with search API", async () => {
    const mockResponse = {
      code: 0,
      "music.search.SearchCgiService": {
        data: {
          body: {
            song: {
              list: [
                {
                  mid: "001BLpXF2DyJe2",
                  name: "Take on Me",
                  singer: [{ mid: "s1", name: "a-ha" }],
                  album: { mid: "a1", name: "Hunting High and Low" },
                  interval: 225,
                },
              ],
            },
          },
        },
        code: 0,
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

    const result = await qqmusicAdapter.searchTrack({ title: "Take on Me", artist: "a-ha" });
    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Take on Me");
    expect(result.track?.artists).toEqual(["a-ha"]);
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it.each(["track", "album"])("rejects a successful %s envelope without the requested collection", async (kind) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        code: 0,
        "music.search.SearchCgiService": { code: 0, data: { body: {} } },
      }),
    );
    const result =
      kind === "track"
        ? qqmusicAdapter.searchTrack({ title: "Get Lucky", artist: "Daft Punk" })
        : qqmusicAdapter.searchAlbum?.({ title: "Random Access Memories", artist: "Daft Punk" });
    await expect(result).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it("should return not found for empty results", async () => {
    const mockResponse = {
      code: 0,
      "music.search.SearchCgiService": {
        data: { body: { song: { list: [] } } },
        code: 0,
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

    const result = await qqmusicAdapter.searchTrack({ title: "Nonexistent", artist: "Nobody" });
    expect(result.found).toBe(false);
  });

  /**
   * An error status or a non-zero `code` is an outage. Answering "not found"
   * would make the resolver skip QQ Music for that track for a month.
   */
  it("throws on an error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 500 }));

    await expect(qqmusicAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/500/);
  });

  it("throws when QQ Music refuses the call with a non-zero code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ code: 500001, ts: 1791824180694 }));

    await expect(qqmusicAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/500001/);
  });

  it("throws when the album search fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 503 }));

    await expect(qqmusicAdapter.searchAlbum?.({ title: "Hunting High and Low", artist: "a-ha" })).rejects.toThrow(
      /503/,
    );
  });
});

describe("QQ Music: adapter metadata", () => {
  it("should have correct id", () => {
    expect(qqmusicAdapter.id).toBe("qqmusic");
  });
  it("should have correct displayName", () => {
    expect(qqmusicAdapter.displayName).toBe("QQ Music");
  });
  it("should not support ISRC", () => {
    expect(qqmusicAdapter.capabilities.supportsIsrc).toBe(false);
  });
});
