import { afterEach, describe, expect, it, vi } from "vitest";
import { beatportAdapter } from "../services/adapters/beatport";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Beatport: detectUrl", () => {
  it("should extract track ID from standard URL", () => {
    expect(beatportAdapter.detectUrl("https://www.beatport.com/track/strobe/1696999")).toBe("1696999");
  });

  it("should extract track ID without www", () => {
    expect(beatportAdapter.detectUrl("https://beatport.com/track/some-track/12345")).toBe("12345");
  });

  it("should return null for non-track URL", () => {
    expect(beatportAdapter.detectUrl("https://www.beatport.com/artist/deadmau5/12345")).toBeNull();
  });

  it("should return null for non-Beatport URL", () => {
    expect(beatportAdapter.detectUrl("https://open.spotify.com/track/abc")).toBeNull();
  });
});

describe("Beatport: isAvailable", () => {
  it("should always return true", () => {
    expect(beatportAdapter.isAvailable()).toBe(true);
  });
});

describe("Beatport: getTrack", () => {
  it("should extract track from OG tags fallback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        `<html><meta property="og:title" content="deadmau5 - Strobe (Original Mix) [Virgin] | Music & Downloads on Beatport"><meta property="og:image" content="https://geo-media.beatport.com/test.jpg"></html>`,
        { status: 200 },
      ),
    );

    const track = await beatportAdapter.getTrack("1696999");
    expect(track.sourceService).toBe("beatport");
    expect(track.title).toBe("Strobe (Original Mix)");
    expect(track.artists).toEqual(["deadmau5"]);
  });

  it("should throw on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    await expect(beatportAdapter.getTrack("invalid")).rejects.toThrow("Track not found");
  });
});

describe("Beatport: searchTrack", () => {
  it("should return not found when no __NEXT_DATA__", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<html><body>No data</body></html>", { status: 200 }),
    );

    const result = await beatportAdapter.searchTrack({ title: "Strobe", artist: "deadmau5" });
    expect(result.found).toBe(false);
  });

  it("should return not found on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const result = await beatportAdapter.searchTrack({ title: "Test", artist: "Test" });
    expect(result.found).toBe(false);
  });
});

describe("Beatport: adapter metadata", () => {
  it("should have correct id", () => {
    expect(beatportAdapter.id).toBe("beatport");
  });
  it("should have correct displayName", () => {
    expect(beatportAdapter.displayName).toBe("Beatport");
  });
  it("should support ISRC", () => {
    expect(beatportAdapter.capabilities.supportsIsrc).toBe(true);
  });
});
