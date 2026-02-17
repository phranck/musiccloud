import { describe, it, expect, vi, afterEach } from "vitest";
import { melonAdapter } from "../services/adapters/melon";

afterEach(() => { vi.restoreAllMocks(); });

describe("Melon: detectUrl", () => {
  it("should extract song ID from standard URL", () => {
    expect(melonAdapter.detectUrl("https://www.melon.com/song/detail.htm?songId=35061523")).toBe("35061523");
  });

  it("should extract song ID without www", () => {
    expect(melonAdapter.detectUrl("https://melon.com/song/detail.htm?songId=12345")).toBe("12345");
  });

  it("should return null for non-song URL", () => {
    expect(melonAdapter.detectUrl("https://www.melon.com/album/detail.htm?albumId=123")).toBeNull();
  });

  it("should return null for non-Melon URL", () => {
    expect(melonAdapter.detectUrl("https://open.spotify.com/track/abc")).toBeNull();
  });
});

describe("Melon: isAvailable", () => {
  it("should always return true", () => {
    expect(melonAdapter.isAvailable()).toBe(true);
  });
});

describe("Melon: getTrack", () => {
  it("should fetch and map JSON-LD data", async () => {
    const jsonLd = {
      "@type": "MusicRecording",
      name: "Dynamite",
      image: "https://cdnimg.melon.co.kr/test.jpg",
      duration: "PT03M19S",
      byArtist: { name: "BTS" },
      inAlbum: { name: "Dynamite (DayTime Version)" },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(`<html><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></html>`, { status: 200 }),
    );

    const track = await melonAdapter.getTrack("35061523");
    expect(track.sourceService).toBe("melon");
    expect(track.title).toBe("Dynamite");
    expect(track.artists).toEqual(["BTS"]);
    expect(track.durationMs).toBe(199000);
  });

  it("should throw on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404 }),
    );
    await expect(melonAdapter.getTrack("invalid")).rejects.toThrow("Track not found");
  });
});

describe("Melon: searchTrack", () => {
  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<html>No results</html>", { status: 200 }),
    );

    const result = await melonAdapter.searchTrack({ title: "Nonexistent", artist: "Nobody" });
    expect(result.found).toBe(false);
  });
});

describe("Melon: adapter metadata", () => {
  it("should have correct id", () => { expect(melonAdapter.id).toBe("melon"); });
  it("should have correct displayName", () => { expect(melonAdapter.displayName).toBe("Melon"); });
  it("should not support ISRC", () => { expect(melonAdapter.capabilities.supportsIsrc).toBe(false); });
});
