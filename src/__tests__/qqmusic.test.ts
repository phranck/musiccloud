import { describe, it, expect, vi, afterEach } from "vitest";
import { qqmusicAdapter } from "../services/adapters/qqmusic";

afterEach(() => { vi.restoreAllMocks(); });

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

describe("QQ Music: isAvailable", () => {
  it("should always return true", () => {
    expect(qqmusicAdapter.isAvailable()).toBe(true);
  });
});

describe("QQ Music: searchTrack", () => {
  it("should find track with search API", async () => {
    const mockResponse = {
      "music.search.SearchCgiService": {
        data: {
          body: {
            song: {
              list: [{
                mid: "001BLpXF2DyJe2",
                name: "Take on Me",
                singer: [{ mid: "s1", name: "a-ha" }],
                album: { mid: "a1", name: "Hunting High and Low" },
                interval: 225,
              }],
            },
          },
        },
        code: 0,
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await qqmusicAdapter.searchTrack({ title: "Take on Me", artist: "a-ha" });
    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Take on Me");
    expect(result.track?.artists).toEqual(["a-ha"]);
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("should return not found for empty results", async () => {
    const mockResponse = {
      "music.search.SearchCgiService": {
        data: { body: { song: { list: [] } } },
        code: 0,
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await qqmusicAdapter.searchTrack({ title: "Nonexistent", artist: "Nobody" });
    expect(result.found).toBe(false);
  });

  it("should return not found on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Error", { status: 500 }),
    );

    const result = await qqmusicAdapter.searchTrack({ title: "Test", artist: "Test" });
    expect(result.found).toBe(false);
  });
});

describe("QQ Music: adapter metadata", () => {
  it("should have correct id", () => { expect(qqmusicAdapter.id).toBe("qqmusic"); });
  it("should have correct displayName", () => { expect(qqmusicAdapter.displayName).toBe("QQ Music"); });
  it("should not support ISRC", () => { expect(qqmusicAdapter.capabilities.supportsIsrc).toBe(false); });
});
