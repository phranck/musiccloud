import { afterEach, describe, expect, it, vi } from "vitest";
import { audiomackAdapter } from "../adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Audiomack: detectUrl", () => {
  it("should extract artist/track slug from URL", () => {
    expect(audiomackAdapter.detectUrl("https://audiomack.com/drake/song/gods-plan")).toBe("drake/gods-plan");
  });

  it("should handle www prefix", () => {
    expect(audiomackAdapter.detectUrl("https://www.audiomack.com/drake/song/gods-plan")).toBe("drake/gods-plan");
  });

  it("should return null for non-song URL", () => {
    expect(audiomackAdapter.detectUrl("https://audiomack.com/drake/album/test")).toBeNull();
  });

  it("should return null for non-Audiomack URL", () => {
    expect(audiomackAdapter.detectUrl("https://open.spotify.com/track/abc")).toBeNull();
  });
});

describe("Audiomack: isAvailable", () => {
  it("should always return true", () => {
    expect(audiomackAdapter.isAvailable()).toBe(true);
  });
});

describe("Audiomack: searchTrack", () => {
  it("should find track with search API", async () => {
    const mockResponse = {
      results: [
        {
          id: 12345,
          title: "Gods Plan",
          artist: "Drake",
          url_slug: "drake/song/gods-plan",
          image: "https://assets.audiomack.com/test.jpg",
          duration: 198,
          url: "https://audiomack.com/drake/song/gods-plan",
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

    const result = await audiomackAdapter.searchTrack({ title: "Gods Plan", artist: "Drake" });
    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Gods Plan");
    expect(result.track?.artists).toEqual(["Drake"]);
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));

    const result = await audiomackAdapter.searchTrack({ title: "Nonexistent", artist: "Nobody" });
    expect(result.found).toBe(false);
  });

  it("should return not found on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const result = await audiomackAdapter.searchTrack({ title: "Test", artist: "Test" });
    expect(result.found).toBe(false);
  });
});

describe("Audiomack: adapter metadata", () => {
  it("should have correct id", () => {
    expect(audiomackAdapter.id).toBe("audiomack");
  });
  it("should have correct displayName", () => {
    expect(audiomackAdapter.displayName).toBe("Audiomack");
  });
  it("should not support ISRC", () => {
    expect(audiomackAdapter.capabilities.supportsIsrc).toBe(false);
  });
});
