import { afterEach, describe, expect, it, vi } from "vitest";
import { melonAdapter } from "../adapter";
import recordedPages from "./fixtures/current-page-metadata.json";

/**
 * Reassembles only the musical schema and raw OG tags captured from current public pages.
 * @param page - Metadata projection without unrelated scripts, images or visitor state.
 * @returns The provider fields used by the parser, retaining the absent byArtist field.
 */
function recordedHtml(page: { tags: string[]; schemas: Array<{ value: unknown }> }): string {
  return (
    page.tags.join("\n") +
    page.schemas
      .map((schema) => `<script type="application/ld+json">${JSON.stringify(schema.value)}</script>`)
      .join("\n")
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("Melon: getTrack", () => {
  it("completes artist credits from the same page when the current schema omits byArtist", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(recordedHtml(recordedPages.track)));
    const track = await melonAdapter.getTrack("4118346");
    expect(track.title).toBe("Get Lucky (feat. Pharrell Williams and Nile Rodgers)");
    expect(track.artists).toEqual(["Daft Punk", "Pharrell Williams", "Nile Rodgers"]);
    expect(track.albumName).toBe("Random Access Memories");
  });

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
      new Response(`<html><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></html>`, {
        status: 200,
      }),
    );

    const track = await melonAdapter.getTrack("35061523");
    expect(track.sourceService).toBe("melon");
    expect(track.title).toBe("Dynamite");
    expect(track.artists).toEqual(["BTS"]);
    expect(track.durationMs).toBe(199000);
  });

  it("should throw on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    await expect(melonAdapter.getTrack("invalid")).rejects.toThrow("Track not found");
  });
});

describe("Melon: searchTrack", () => {
  it("reads the current album row identifier and its same-page artist credits", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) =>
        new Response(
          new URL(String(input)).pathname.includes("/search/")
            ? '<i data-album-no="2185777"></i>'
            : recordedHtml(recordedPages.album),
        ),
    );
    const result = await melonAdapter.searchAlbum?.({ title: "Random Access Memories", artist: "Daft Punk" });
    expect(result?.found).toBe(true);
    expect(result?.album).toMatchObject({
      sourceId: "2185777",
      title: "Random Access Memories",
      artists: ["Daft Punk"],
    });
  });

  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<html>No results</html>", { status: 200 }));

    const result = await melonAdapter.searchTrack({ title: "Nonexistent", artist: "Nobody" });
    expect(result.found).toBe(false);
  });

  /**
   * Melon answers a search without results with 200, so an error status is an
   * outage. Answering "not found" would make the resolver skip Melon for that
   * track for a month.
   */
  it("throws when the search page fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Busy", { status: 503 }));

    await expect(melonAdapter.searchTrack({ title: "Dynamite", artist: "BTS" })).rejects.toThrow(/503/);
  });

  it.each([
    "missing",
    "different-recording",
  ])("does not cache a partial candidate failure as a miss after a %s reply", async (reply) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/search/"))
        return new Response('<i data-song-no="4118346"></i><i data-song-no="4094951"></i>');
      if (url.searchParams.get("songId") === "4094951") return new Response("Busy", { status: 500 });
      return reply === "missing"
        ? new Response("Not Found", { status: 404 })
        : new Response(recordedHtml(recordedPages.track));
    });
    await expect(melonAdapter.searchTrack({ title: "Dynamite", artist: "BTS" })).rejects.toThrow(/500/);
  });

  it("retains an accepted recording when an unrelated candidate page fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/search/"))
        return new Response('<i data-song-no="4118346"></i><i data-song-no="4094951"></i>');
      return url.searchParams.get("songId") === "4094951"
        ? new Response("Busy", { status: 500 })
        : new Response(recordedHtml(recordedPages.track));
    });
    await expect(melonAdapter.searchTrack({ title: "Get Lucky", artist: "Daft Punk" })).resolves.toMatchObject({
      found: true,
    });
  });

  it("throws when every song page of a search fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response('<i data-song-no="1"></i><i data-song-no="2"></i>', { status: 200 }))
      .mockResolvedValue(new Response("Busy", { status: 500 }));

    await expect(melonAdapter.searchTrack({ title: "Dynamite", artist: "BTS" })).rejects.toThrow(/500/);
  });

  it("throws when the album search page fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Busy", { status: 429 }));

    await expect(melonAdapter.searchAlbum?.({ title: "BE", artist: "BTS" })).rejects.toThrow(/429/);
  });
});

describe("Melon: adapter metadata", () => {
  it("should have correct id", () => {
    expect(melonAdapter.id).toBe("melon");
  });
  it("should have correct displayName", () => {
    expect(melonAdapter.displayName).toBe("Melon");
  });
  it("should not support ISRC", () => {
    expect(melonAdapter.capabilities.supportsIsrc).toBe(false);
  });
});
