import { beforeEach, describe, expect, it, vi } from "vitest";
import { boomplayAdapter } from "../services/adapters/boomplay";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

/** Helper: build a Boomplay song page HTML with JSON-LD */
function buildSongPage(opts: {
  name: string;
  artist: string;
  album?: string;
  duration?: string;
  image?: string;
  songId?: string;
}): string {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: opts.name,
    url: `https://www.boomplay.com/songs/${opts.songId ?? "12345"}`,
    "@id": `https://www.boomplay.com/songs/${opts.songId ?? "12345"}`,
    inAlbum: opts.album ? { "@type": "MusicAlbum", name: opts.album } : undefined,
    image: opts.image ?? "https://source.boomplaymusic.com/cover.jpg",
    duration: opts.duration ?? "PT03M45S",
    byArtist: [{ "@type": "Person", name: opts.artist }],
  };

  return `<!DOCTYPE html><html><head>
    <title>${opts.name} - ${opts.artist} | Boomplay</title>
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  </head><body></body></html>`;
}

/** Helper: build a Boomplay search results page with data-id attributes */
function buildSearchPage(ids: string[]): string {
  const items = ids.map((id) => `<div data-id="${id}"></div>`).join("\n");
  return `<!DOCTYPE html><html><head><title>Search | Boomplay</title></head>
    <body>${items}</body></html>`;
}

function ok(body: string) {
  return Promise.resolve(new Response(body, { status: 200 }));
}

function notOk(status = 404) {
  return Promise.resolve(new Response("", { status }));
}

// ── URL Detection ──

describe("Boomplay: detectUrl", () => {
  it("should detect standard song URL", () => {
    expect(boomplayAdapter.detectUrl("https://www.boomplay.com/songs/5043759")).toBe("5043759");
  });

  it("should detect URL without www", () => {
    expect(boomplayAdapter.detectUrl("https://boomplay.com/songs/5043759")).toBe("5043759");
  });

  it("should detect HTTP URL", () => {
    expect(boomplayAdapter.detectUrl("http://www.boomplay.com/songs/12345")).toBe("12345");
  });

  it("should return null for non-song URLs", () => {
    expect(boomplayAdapter.detectUrl("https://www.boomplay.com/artists/1234")).toBeNull();
    expect(boomplayAdapter.detectUrl("https://www.boomplay.com/albums/1234")).toBeNull();
    expect(boomplayAdapter.detectUrl("https://www.boomplay.com/")).toBeNull();
  });

  it("should return null for non-Boomplay URLs", () => {
    expect(boomplayAdapter.detectUrl("https://open.spotify.com/track/abc")).toBeNull();
  });
});

// ── getTrack ──

describe("Boomplay: getTrack", () => {
  it("should parse JSON-LD from song page", async () => {
    mockFetch.mockReturnValueOnce(
      ok(
        buildSongPage({
          name: "Take on Me",
          artist: "a-ha",
          album: "Hunting High and Low",
          duration: "PT03M45S",
          songId: "5043759",
        }),
      ),
    );

    const track = await boomplayAdapter.getTrack("5043759");
    expect(track.title).toBe("Take on Me");
    expect(track.artists).toEqual(["a-ha"]);
    expect(track.albumName).toBe("Hunting High and Low");
    expect(track.durationMs).toBe(225000); // 3*60+45 = 225s
    expect(track.webUrl).toBe("https://www.boomplay.com/songs/5043759");
    expect(track.sourceService).toBe("boomplay");
  });

  it("should handle page without JSON-LD", async () => {
    mockFetch.mockReturnValueOnce(ok("<html><head><title>Boomplay</title></head><body></body></html>"));
    await expect(boomplayAdapter.getTrack("999")).rejects.toThrow("Boomplay: Track not found");
  });

  it("should handle HTTP error", async () => {
    mockFetch.mockReturnValueOnce(notOk(404));
    await expect(boomplayAdapter.getTrack("999")).rejects.toThrow("Boomplay: Track not found");
  });

  it("should handle duration with hours", async () => {
    mockFetch.mockReturnValueOnce(
      ok(
        buildSongPage({
          name: "Long Track",
          artist: "Artist",
          duration: "PT01H02M30S",
        }),
      ),
    );

    const track = await boomplayAdapter.getTrack("1");
    expect(track.durationMs).toBe((3600 + 120 + 30) * 1000);
  });

  it("should handle missing optional fields", async () => {
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "MusicRecording",
      name: "Minimal Track",
      byArtist: [{ "@type": "Person", name: "Artist" }],
    };
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head></html>`;
    mockFetch.mockReturnValueOnce(ok(html));

    const track = await boomplayAdapter.getTrack("1");
    expect(track.title).toBe("Minimal Track");
    expect(track.durationMs).toBeUndefined();
    expect(track.albumName).toBeUndefined();
  });
});

// ── findByIsrc ──

describe("Boomplay: findByIsrc", () => {
  it("should always return null", async () => {
    expect(await boomplayAdapter.findByIsrc("USRC12345678")).toBeNull();
  });
});

// ── searchTrack ──

describe("Boomplay: searchTrack", () => {
  it("should find track via search page + JSON-LD", async () => {
    mockFetch
      .mockReturnValueOnce(ok(buildSearchPage(["111", "222"])))
      .mockReturnValueOnce(
        ok(
          buildSongPage({
            name: "Take on Me",
            artist: "a-ha",
            songId: "111",
          }),
        ),
      )
      .mockReturnValueOnce(
        ok(
          buildSongPage({
            name: "Something Else",
            artist: "Other Artist",
            songId: "222",
          }),
        ),
      );

    const result = await boomplayAdapter.searchTrack({
      title: "Take on Me",
      artist: "a-ha",
    });

    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Take on Me");
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.matchMethod).toBe("search");
  });

  it("should return not found for empty search results", async () => {
    mockFetch.mockReturnValueOnce(ok(buildSearchPage([])));

    const result = await boomplayAdapter.searchTrack({
      title: "Nonexistent Song",
      artist: "Nobody",
    });

    expect(result.found).toBe(false);
  });

  it("should return not found on search page HTTP error", async () => {
    mockFetch.mockReturnValueOnce(notOk(500));

    const result = await boomplayAdapter.searchTrack({
      title: "Test",
      artist: "Test",
    });

    expect(result.found).toBe(false);
  });

  it("should handle failed individual song page fetches", async () => {
    mockFetch
      .mockReturnValueOnce(ok(buildSearchPage(["111", "222"])))
      .mockReturnValueOnce(notOk(404)) // first result fails
      .mockReturnValueOnce(
        ok(
          buildSongPage({
            name: "Take on Me",
            artist: "a-ha",
            songId: "222",
          }),
        ),
      );

    const result = await boomplayAdapter.searchTrack({
      title: "Take on Me",
      artist: "a-ha",
    });

    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Take on Me");
  });

  it("should deduplicate song IDs", async () => {
    // Search page has duplicate IDs
    const html = `<html><body>
      <div data-id="111"></div>
      <div data-id="111"></div>
      <div data-id="222"></div>
    </body></html>`;

    mockFetch
      .mockReturnValueOnce(ok(html))
      .mockReturnValueOnce(ok(buildSongPage({ name: "Song", artist: "Artist", songId: "111" })))
      .mockReturnValueOnce(ok(buildSongPage({ name: "Song 2", artist: "Artist 2", songId: "222" })));

    await boomplayAdapter.searchTrack({ title: "Song", artist: "Artist" });

    // Should only fetch 2 unique IDs, not 3
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 search + 2 songs
  });

  it("should use free-text scoring when title equals artist", async () => {
    mockFetch
      .mockReturnValueOnce(ok(buildSearchPage(["111"])))
      .mockReturnValueOnce(ok(buildSongPage({ name: "Test Song", artist: "Test Artist", songId: "111" })));

    const result = await boomplayAdapter.searchTrack({
      title: "Test Song Test Artist",
      artist: "Test Song Test Artist",
    });

    expect(result.found).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it("should pick best match from multiple results", async () => {
    mockFetch
      .mockReturnValueOnce(ok(buildSearchPage(["111", "222"])))
      .mockReturnValueOnce(ok(buildSongPage({ name: "Take on Me", artist: "a-ha", songId: "111" })))
      .mockReturnValueOnce(ok(buildSongPage({ name: "Take Me Away", artist: "Other", songId: "222" })));

    const result = await boomplayAdapter.searchTrack({
      title: "Take on Me",
      artist: "a-ha",
    });

    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Take on Me");
    expect(result.track?.artists).toEqual(["a-ha"]);
  });
});
