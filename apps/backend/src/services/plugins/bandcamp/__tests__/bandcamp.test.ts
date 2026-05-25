import { afterEach, describe, expect, it, vi } from "vitest";
import { bandcampAdapter } from "../adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

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
      new Response(`<html><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></html>`, {
        status: 200,
      }),
    );

    const track = await bandcampAdapter.getTrack("https://someartist.bandcamp.com/track/cool-song");
    expect(track.sourceService).toBe("bandcamp");
    expect(track.title).toBe("Cool Song");
    expect(track.artists).toEqual(["Some Artist"]);
    expect(track.albumName).toBe("Cool Album");
    expect(track.durationMs).toBe(225000);
    expect(track.releaseDate).toBe("2024-01-15");
  });

  it("should prefer embedded track artist over label-style JSON-LD artist", async () => {
    const jsonLd = {
      "@type": "MusicRecording",
      name: "Electric Lover",
      url: "https://infactedrecordings.bandcamp.com/track/electric-lover",
      duration: "P00H04M19S",
      byArtist: { name: "Infacted Recordings" },
      inAlbum: { name: "Electric Lover" },
    };
    const embedData = {
      artist: "Lights Of Euphoria",
      album_embed_data: { artist: "Lights Of Euphoria", album_title: "Electric Lover" },
    };
    const encodedEmbed = JSON.stringify(embedData).replace(/"/g, "&quot;");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        `<html><script type="application/ld+json">${JSON.stringify(jsonLd)}</script><div data-embed="${encodedEmbed}"></div></html>`,
        { status: 200 },
      ),
    );

    const track = await bandcampAdapter.getTrack("https://infactedrecordings.bandcamp.com/track/electric-lover");
    expect(track.title).toBe("Electric Lover");
    expect(track.artists).toEqual(["Lights Of Euphoria"]);
    expect(track.albumName).toBe("Electric Lover");
  });

  it("should fallback to OG tags", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        `<html><meta property="og:title" content="Cool Song, by Some Artist"><meta property="og:image" content="https://f4.bcbits.com/img/test.jpg"></html>`,
        { status: 200 },
      ),
    );

    const track = await bandcampAdapter.getTrack("https://someartist.bandcamp.com/track/cool-song");
    expect(track.title).toBe("Cool Song");
    expect(track.artists).toEqual(["Some Artist"]);
  });

  it("should throw on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    await expect(bandcampAdapter.getTrack("https://someartist.bandcamp.com/track/invalid")).rejects.toThrow(
      "Track not found",
    );
  });
});

// =============================================================================
// searchTrack
// =============================================================================

describe("Bandcamp: searchTrack", () => {
  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));

    const result = await bandcampAdapter.searchTrack({ title: "Nonexistent", artist: "Nobody" });
    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("should search tracks via the fuzzysearch JSON endpoint", async () => {
    const jsonLd = {
      "@type": "MusicRecording",
      name: "Hungry Or A Liar (Cyberpunk Rework)",
      url: "https://faderhead.bandcamp.com/track/hungry-or-a-liar-cyberpunk-rework",
      duration: "P00H03M48S",
      byArtist: { name: "Faderhead x Paul Woida" },
      inAlbum: { name: "Hungry Or A Liar (Cyberpunk Rework)" },
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://bandcamp.com/api/fuzzysearch/2/app_autocomplete")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                type: "t",
                name: "Hungry Or A Liar (Cyberpunk Rework)",
                band_name: "Faderhead x Paul Woida",
                url: "https://faderhead.bandcamp.comhttps://faderhead.bandcamp.com/track/hungry-or-a-liar-cyberpunk-rework",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url === "https://faderhead.bandcamp.com/track/hungry-or-a-liar-cyberpunk-rework") {
        return new Response(`<html><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></html>`, {
          status: 200,
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const result = await bandcampAdapter.searchTrack({
      title: "Hungry Or A Liar - Cyberpunk Rework",
      artist: "Faderhead",
      artists: ["Faderhead", "Paul Woida"],
      durationMs: 228000,
    });

    expect(result.found).toBe(true);
    expect(result.track?.webUrl).toBe("https://faderhead.bandcamp.com/track/hungry-or-a-liar-cyberpunk-rework");
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("should derive track matches from album fuzzysearch results", async () => {
    const albumJsonLd = {
      "@type": "MusicAlbum",
      name: "Electric Lover",
      url: "https://infactedrecordings.bandcamp.com/album/electric-lover",
      image: "https://f4.bcbits.com/img/a1234567890_10.jpg",
      datePublished: "2025-09-26",
      byArtist: { name: "Lights Of Euphoria" },
      numTracks: 2,
      track: {
        itemListElement: [
          { position: 1, item: { "@type": "MusicRecording", name: "Electric Lover", duration: "P00H04M19S" } },
          { position: 2, item: { "@type": "MusicRecording", name: "Chasing Dreams", duration: "P00H03M36S" } },
        ],
      },
    };
    const tralbumData = {
      trackinfo: [
        { title: "Electric Lover", title_link: "/track/electric-lover", artist: null, duration: 259.839, track_num: 1 },
        { title: "Chasing Dreams", title_link: "/track/chasing-dreams", artist: null, duration: 216.0, track_num: 2 },
      ],
    };
    const encodedTralbum = JSON.stringify(tralbumData).replace(/"/g, "&quot;");

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://bandcamp.com/api/fuzzysearch/2/app_autocomplete")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                type: "a",
                name: "Electric Lover",
                band_name: "Lights Of Euphoria",
                url: "https://infactedrecordings.bandcamp.comhttps://infactedrecordings.bandcamp.com/album/electric-lover",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url === "https://infactedrecordings.bandcamp.com/album/electric-lover") {
        return new Response(
          `<html><script type="application/ld+json">${JSON.stringify(albumJsonLd)}</script><div data-tralbum="${encodedTralbum}"></div></html>`,
          { status: 200 },
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const result = await bandcampAdapter.searchTrack({
      title: "Electric Lover",
      artist: "Lights Of Euphoria",
      artists: ["Lights Of Euphoria"],
      durationMs: 259838,
    });

    expect(result.found).toBe(true);
    expect(result.track?.webUrl).toBe("https://infactedrecordings.bandcamp.com/track/electric-lover");
    expect(result.track?.artists).toEqual(["Lights Of Euphoria"]);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("should return not found on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 500 }));

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
