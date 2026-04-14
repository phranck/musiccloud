import { afterEach, describe, expect, it, vi } from "vitest";
import { neteaseAdapter } from "../adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("NetEase: isAvailable", () => {
  it("should always return true", () => {
    expect(neteaseAdapter.isAvailable()).toBe(true);
  });
});

describe("NetEase: getTrack", () => {
  it("should fetch and map track data", async () => {
    const mockResponse = {
      songs: [
        {
          id: 123456,
          name: "Take on Me",
          ar: [{ id: 1, name: "a-ha" }],
          al: { id: 10, name: "Hunting High and Low", picUrl: "https://p1.music.126.net/test.jpg" },
          dt: 225000,
        },
      ],
      code: 200,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

    const track = await neteaseAdapter.getTrack("123456");
    expect(track.sourceService).toBe("netease");
    expect(track.title).toBe("Take on Me");
    expect(track.artists).toEqual(["a-ha"]);
    expect(track.albumName).toBe("Hunting High and Low");
    expect(track.durationMs).toBe(225000);
  });

  it("should throw on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    await expect(neteaseAdapter.getTrack("invalid")).rejects.toThrow("Track not found");
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

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(mockSearch), { status: 200 }));

    const result = await neteaseAdapter.searchTrack({ title: "Take on Me", artist: "a-ha" });
    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Take on Me");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ result: { songs: [], songCount: 0 } }), { status: 200 }),
    );

    const result = await neteaseAdapter.searchTrack({ title: "Nonexistent", artist: "Nobody" });
    expect(result.found).toBe(false);
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
