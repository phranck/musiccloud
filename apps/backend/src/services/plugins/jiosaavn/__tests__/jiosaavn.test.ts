import { afterEach, describe, expect, it, vi } from "vitest";
import { jiosaavnAdapter } from "../adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

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
// isAvailable
// =============================================================================

describe("JioSaavn: isAvailable", () => {
  it("should always return true", () => {
    expect(jiosaavnAdapter.isAvailable()).toBe(true);
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

  it("should throw on invalid response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<!DOCTYPE html>", { status: 200 }));
    await expect(jiosaavnAdapter.getTrack("invalid")).rejects.toThrow("Track not found");
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
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));

    const result = await jiosaavnAdapter.searchTrack({ title: "Nonexistent", artist: "Nobody" });
    expect(result.found).toBe(false);
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
