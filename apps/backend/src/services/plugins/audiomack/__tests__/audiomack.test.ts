import { afterEach, describe, expect, it, vi } from "vitest";
import { audiomackAdapter } from "../adapter";
import recordedPages from "./fixtures/current-page-titles.json";

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

describe("Audiomack: current page metadata", () => {
  it.each([
    {
      kind: "track",
      id: "ti-blaze/round-one-elle-mummy-6276266",
      title: "Round One (Elle Mummy)",
      artist: "T.I BLAZE",
      page: recordedPages[0],
    },
    { kind: "album", id: "folapondis/9-4108363", title: "9", artist: "FOLA", page: recordedPages[1] },
  ])("does not include page branding in the $kind performer credit", async ({ kind, id, title, artist, page }) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(page.tags.join("\n")));
    const value = kind === "track" ? await audiomackAdapter.getTrack(id) : await audiomackAdapter.getAlbum?.(id);
    expect(value?.title).toBe(title);
    expect(value?.artists).toEqual([artist]);
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

  /**
   * A search without results is an empty list, so an error status is an
   * outage. Answering "not found" would make the resolver skip Audiomack for
   * that track for a month.
   */
  it("throws when the search fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 500 }));

    await expect(audiomackAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/500/);
  });

  it("throws when the search answers with a body it cannot read", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<html>", { status: 200 }));

    await expect(audiomackAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow();
  });

  it("throws when the album search fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 503 }));

    await expect(audiomackAdapter.searchAlbum?.({ title: "Scorpion", artist: "Drake" })).rejects.toThrow(/503/);
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
