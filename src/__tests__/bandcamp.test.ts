import { describe, it, expect, vi, afterEach } from "vitest";
import { bandcampAdapter } from "../services/adapters/bandcamp";

afterEach(() => { vi.restoreAllMocks(); });

// =============================================================================
// detectUrl
// =============================================================================

describe("Bandcamp: detectUrl", () => {
  it("should detect standard track URL", () => {
    const result = bandcampAdapter.detectUrl("https://someartist.bandcamp.com/track/cool-song");
    expect(result).toBe("https://someartist.bandcamp.com/track/cool-song");
  });

  it("should strip query params", () => {
    const result = bandcampAdapter.detectUrl("https://someartist.bandcamp.com/track/cool-song?from=embed");
    expect(result).toBe("https://someartist.bandcamp.com/track/cool-song");
  });

  it("should return null for album URL", () => {
    expect(bandcampAdapter.detectUrl("https://someartist.bandcamp.com/album/cool-album")).toBeNull();
  });

  it("should return null for non-Bandcamp URL", () => {
    expect(bandcampAdapter.detectUrl("https://open.spotify.com/track/abc123")).toBeNull();
  });
});

// =============================================================================
// isAvailable
// =============================================================================

describe("Bandcamp: isAvailable", () => {
  it("should always return true", () => {
    expect(bandcampAdapter.isAvailable()).toBe(true);
  });
});

// =============================================================================
// getTrack
// =============================================================================

describe("Bandcamp: getTrack", () => {
  it("should fetch and map JSON-LD data", async () => {
    const jsonLd = {
      "@type": "MusicRecording",
      name: "Cool Song",
      url: "https://someartist.bandcamp.com/track/cool-song",
      image: "https://f4.bcbits.com/img/a1234567890_10.jpg",
      duration: "P00H03M45S",
      datePublished: "2024-01-15",
      byArtist: { name: "Some Artist" },
      inAlbum: { name: "Cool Album" },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(`<html><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></html>`, { status: 200 }),
    );

    const track = await bandcampAdapter.getTrack("https://someartist.bandcamp.com/track/cool-song");
    expect(track.sourceService).toBe("bandcamp");
    expect(track.title).toBe("Cool Song");
    expect(track.artists).toEqual(["Some Artist"]);
    expect(track.albumName).toBe("Cool Album");
    expect(track.durationMs).toBe(225000);
    expect(track.releaseDate).toBe("2024-01-15");
  });

  it("should fallback to OG tags", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(`<html><meta property="og:title" content="Cool Song, by Some Artist"><meta property="og:image" content="https://f4.bcbits.com/img/test.jpg"></html>`, { status: 200 }),
    );

    const track = await bandcampAdapter.getTrack("https://someartist.bandcamp.com/track/cool-song");
    expect(track.title).toBe("Cool Song");
    expect(track.artists).toEqual(["Some Artist"]);
  });

  it("should throw on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404 }),
    );
    await expect(bandcampAdapter.getTrack("https://someartist.bandcamp.com/track/invalid")).rejects.toThrow("Track not found");
  });
});

// =============================================================================
// searchTrack
// =============================================================================

describe("Bandcamp: searchTrack", () => {
  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<html><body>No results</body></html>", { status: 200 }),
    );

    const result = await bandcampAdapter.searchTrack({ title: "Nonexistent", artist: "Nobody" });
    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("should return not found on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Error", { status: 500 }),
    );

    const result = await bandcampAdapter.searchTrack({ title: "Test", artist: "Test" });
    expect(result.found).toBe(false);
  });
});

// =============================================================================
// Metadata
// =============================================================================

describe("Bandcamp: adapter metadata", () => {
  it("should have correct id", () => {
    expect(bandcampAdapter.id).toBe("bandcamp");
  });

  it("should have correct displayName", () => {
    expect(bandcampAdapter.displayName).toBe("Bandcamp");
  });

  it("should not support ISRC", () => {
    expect(bandcampAdapter.capabilities.supportsIsrc).toBe(false);
  });
});
