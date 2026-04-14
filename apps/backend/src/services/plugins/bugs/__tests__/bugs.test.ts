import { afterEach, describe, expect, it, vi } from "vitest";
import { bugsAdapter } from "../adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Bugs!: detectUrl", () => {
  it("should extract track ID from standard URL", () => {
    expect(bugsAdapter.detectUrl("https://music.bugs.co.kr/track/6199298")).toBe("6199298");
  });

  it("should return null for non-track URL", () => {
    expect(bugsAdapter.detectUrl("https://music.bugs.co.kr/album/20123456")).toBeNull();
  });

  it("should return null for non-Bugs URL", () => {
    expect(bugsAdapter.detectUrl("https://open.spotify.com/track/abc")).toBeNull();
  });
});

describe("Bugs!: isAvailable", () => {
  it("should always return true", () => {
    expect(bugsAdapter.isAvailable()).toBe(true);
  });
});

describe("Bugs!: getTrack", () => {
  it("should fetch and map OG tag data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        `<html><meta property="og:title" content="Dynamite / BTS"><meta property="og:image" content="https://image.bugsm.co.kr/test.jpg"></html>`,
        { status: 200 },
      ),
    );

    const track = await bugsAdapter.getTrack("6199298");
    expect(track.sourceService).toBe("bugs");
    expect(track.title).toBe("Dynamite");
    expect(track.artists).toEqual(["BTS"]);
  });

  it("should split multiple artists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(`<html><meta property="og:title" content="Song / Artist A, Artist B & Artist C"></html>`, {
        status: 200,
      }),
    );

    const track = await bugsAdapter.getTrack("123");
    expect(track.artists).toEqual(["Artist A", "Artist B", "Artist C"]);
  });

  it("should throw on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    await expect(bugsAdapter.getTrack("invalid")).rejects.toThrow("Track not found");
  });
});

describe("Bugs!: searchTrack", () => {
  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<html>No results</html>", { status: 200 }));

    const result = await bugsAdapter.searchTrack({ title: "Nonexistent", artist: "Nobody" });
    expect(result.found).toBe(false);
  });
});

describe("Bugs!: adapter metadata", () => {
  it("should have correct id", () => {
    expect(bugsAdapter.id).toBe("bugs");
  });
  it("should have correct displayName", () => {
    expect(bugsAdapter.displayName).toBe("Bugs!");
  });
  it("should not support ISRC", () => {
    expect(bugsAdapter.capabilities.supportsIsrc).toBe(false);
  });
});
