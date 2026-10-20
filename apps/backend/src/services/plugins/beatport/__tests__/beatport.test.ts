import { afterEach, describe, expect, it, vi } from "vitest";
import { beatportAdapter } from "../adapter";

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
  /**
   * A search Beatport answers carries `__NEXT_DATA__` with empty results when
   * nothing matches. A page without it, such as a challenge page, and an error
   * status are outages, and answering "not found" would make the resolver
   * skip Beatport for that track for a month.
   */
  it("throws when the search page carries no __NEXT_DATA__", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<html><body>No data</body></html>", { status: 200 }),
    );

    await expect(beatportAdapter.searchTrack({ title: "Strobe", artist: "deadmau5" })).rejects.toThrow(/__NEXT_DATA__/);
  });

  it("throws when the search page answers with an error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 403 }));

    await expect(beatportAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/403/);
  });

  it("throws when the ISRC lookup page fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 503 }));

    await expect(beatportAdapter.findByIsrc("GBUM71029604")).rejects.toThrow(/503/);
  });

  it("throws when the release search page fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 429 }));

    await expect(
      beatportAdapter.searchAlbum?.({ title: "For Lack of a Better Name", artist: "deadmau5" }),
    ).rejects.toThrow(/429/);
  });
});

/** Serializes a synthetic hydration envelope to exercise protocol robustness, not live coverage. */
function searchPage(nextData: unknown): Response {
  return new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`);
}

for (const control of [
  { name: "track", run: () => beatportAdapter.searchTrack({ title: "Strobe", artist: "deadmau5" }), key: "tracks" },
  { name: "ISRC", run: () => beatportAdapter.findByIsrc("GBUM71029604"), key: "tracks" },
  { name: "album", run: () => beatportAdapter.searchAlbum?.({ title: "Test", artist: "Test" }), key: "releases" },
]) {
  describe(`Beatport: ${control.name} nested search contract`, () => {
    it.each([
      {},
      { props: { pageProps: { dehydratedState: { queries: [{ state: { data: {} } }] } } } },
    ])("rejects hydration without the requested result collection (%j)", async (payload) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(searchPage(payload));
      await expect(control.run()).rejects.toThrow();
    });

    it("rejects unrecognized result rows instead of claiming absence", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        searchPage({
          props: { pageProps: { dehydratedState: { queries: [{ state: { data: { [control.key]: [{}] } } }] } } },
        }),
      );
      await expect(control.run()).rejects.toThrow();
    });

    it("accepts an explicit completed empty collection", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        searchPage({
          props: { pageProps: { dehydratedState: { queries: [{ state: { data: { [control.key]: [] } } }] } } },
        }),
      );
      const result = await control.run();
      if (control.name === "ISRC") expect(result).toBeNull();
      else expect(result).toMatchObject({ found: false });
    });
  });
}

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
