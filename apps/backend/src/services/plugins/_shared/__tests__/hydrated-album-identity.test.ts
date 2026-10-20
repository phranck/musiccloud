import { afterEach, describe, expect, it, vi } from "vitest";
import { jiosaavnAdapter } from "../../jiosaavn/adapter";
import { _resetClientIdCache, soundcloudAdapter } from "../../soundcloud/adapter";

const query = { title: "Random Access Memories", artist: "Daft Punk" };

afterEach(() => {
  vi.restoreAllMocks();
  _resetClientIdCache();
});

/** Synthetic detail/score correlation controls with all HTTP replaced. */
describe("hydrated album identity", () => {
  it.each([
    "missing-higher-detail",
    "different-full-metadata",
  ])("does not accept an unrelated JioSaavn album after %s", async (scenario) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const params = new URL(String(input)).searchParams;
      if (params.get("__call") === "search.getAlbumResults")
        return Response.json({
          results:
            scenario === "missing-higher-detail"
              ? [
                  { id: "1", title: "Random Other Album", music: query.artist },
                  { id: "2", title: query.title, music: query.artist },
                ]
              : [{ id: "1", title: query.title, music: query.artist }],
        });
      if (params.get("albumid") === "2") return Response.json([]);
      return Response.json({
        albumid: "1",
        name: "Random Other Album",
        primary_artists: query.artist,
        perma_url: "https://example.invalid/album",
        image: "",
      });
    });
    expect((await jiosaavnAdapter.searchAlbum?.(query))?.found).toBe(false);
  });

  it.each([
    "missing-higher-detail",
    "different-full-metadata",
  ])("does not accept an unrelated SoundCloud album after %s", async (scenario) => {
    _resetClientIdCache();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "soundcloud.com")
        return new Response(
          '<script>window.__sc_hydration=[{"hydratable":"apiClient","data":{"id":"test-only-client"}}];</script>',
        );
      if (url.pathname === "/search/albums")
        return Response.json({
          collection:
            scenario === "missing-higher-detail"
              ? [
                  {
                    title: "Random Other Album",
                    user: { username: query.artist },
                    permalink_url: "https://soundcloud.com/test-only/sets/first",
                  },
                  {
                    title: query.title,
                    user: { username: query.artist },
                    permalink_url: "https://soundcloud.com/test-only/sets/second",
                  },
                ]
              : [
                  {
                    title: query.title,
                    user: { username: query.artist },
                    permalink_url: "https://soundcloud.com/test-only/sets/first",
                  },
                ],
        });
      if (url.searchParams.get("url")?.endsWith("/second")) return new Response(null, { status: 404 });
      return Response.json({
        title: "Random Other Album",
        user: { username: query.artist },
        permalink_url: "https://soundcloud.com/test-only/sets/first",
      });
    });
    expect((await soundcloudAdapter.searchAlbum(query)).found).toBe(false);
  });
});
