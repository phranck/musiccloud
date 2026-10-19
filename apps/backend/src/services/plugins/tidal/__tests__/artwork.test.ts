import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/infra/token-manager", () => ({
  TokenManager: class {
    isConfigured() {
      return true;
    }
    async getAccessToken() {
      return "test-only-token";
    }
    reset() {}
  },
}));

import { tidalAdapter } from "../adapter";
import recorded from "./fixtures/current-artwork.json";

const COVER = "https://resources.tidal.com/images/b66a5c40/c34d/4507/a0dc/5f98e46fdd20/1280x1280.jpg";
const PORTRAIT = "https://resources.tidal.com/images/65d23ddc/7b3b/4b17/bc84/b02832ddc204/750x750.jpg";

/**
 * Supplies one projected response without account authentication or provider traffic.
 * @param body - Projected metadata graph; no unrestricted provider body or credentials.
 * @returns Fetch spy for assertions; its next request is mocked and never reaches Tidal.
 */
function respond(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(body));
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

/**
 * Resource graphs were projected from 2026-10-19 metadata controls. Search keeps
 * the first ranked resource of each kind plus its actual referenced graph;
 * omitted provider fields remain omitted rather than being manufactured.
 */
describe("Tidal: current artwork relationships", () => {
  it("reads the recording cover from its included album rather than a portrait", async () => {
    const fetchSpy = respond(recorded.track);
    const track = await tidalAdapter.getTrack("20115564");
    expect(track.artworkUrl).toBe(COVER);
    expect(track.artists).toEqual(["Daft Punk", "Pharrell Williams", "Nile Rodgers"]);
    expect(new URL(String(fetchSpy.mock.calls[0][0])).searchParams.get("include")).toContain("albums.coverArt");
  });

  it("reads album cover files and parses included ISO track durations", async () => {
    const fetchSpy = respond(recorded.album);
    const album = await tidalAdapter.getAlbum("20115556");
    expect(album.artworkUrl).toBe(COVER);
    expect(album.title).toBe("Random Access Memories");
    expect(album.tracks).toHaveLength(13);
    expect(album.tracks?.[0].durationMs).toBe(275000);
    expect(new URL(String(fetchSpy.mock.calls[0][0])).searchParams.get("include")).toContain("coverArt");
  });

  it("does not multiply an ISO listing duration into NaN", async () => {
    respond(recorded.album);
    const album = await tidalAdapter.getAlbum("20115556");
    expect(album.tracks?.[0].durationMs).toBe(275000);
  });

  it("uses profileArt for artist portraits without treating it as a recording cover", async () => {
    const fetchSpy = respond(recorded.artist);
    const artist = await tidalAdapter.getArtist("8847");
    expect(artist.imageUrl).toBe(PORTRAIT);
    expect(new URL(String(fetchSpy.mock.calls[0][0])).searchParams.get("include")).toContain("profileArt");
  });

  it("retains artwork through identifier collection mappings", async () => {
    respond({ data: [recorded.track.data], included: recorded.track.included });
    expect((await tidalAdapter.findByIsrc("USQX91300108"))?.artworkUrl).toBe(COVER);
    vi.restoreAllMocks();
    respond({ data: [recorded.album.data], included: recorded.album.included });
    expect((await tidalAdapter.findAlbumByUpc(recorded.album.data.attributes.barcodeId))?.artworkUrl).toBe(COVER);
  });

  it("keeps current artwork in track, album and artist search projections", async () => {
    respond(recorded.search);
    const track = await tidalAdapter.searchTrack({ title: "Get Lucky", artist: "Daft Punk", artists: ["Daft Punk"] });
    expect(track.found).toBe(true);
    expect(track.track?.artworkUrl).toBe(COVER);
    vi.restoreAllMocks();
    respond(recorded.search);
    const album = await tidalAdapter.searchAlbum({
      title: "Get Lucky (Radio Edit - feat. Pharrell Williams and Nile Rodgers)",
      artist: "Daft Punk",
    });
    expect(album.found).toBe(true);
    expect(album.album?.artworkUrl).toBeTypeOf("string");
    vi.restoreAllMocks();
    respond(recorded.search);
    expect((await tidalAdapter.searchArtist({ name: "Daft Punk" })).artist?.imageUrl).toBe(PORTRAIT);
  });

  it("joins artwork by both type and id, independent of included order", async () => {
    const collision = {
      ...recorded.artist.included[0],
      type: "artists",
      id: recorded.album.data.relationships.coverArt.data[0].id,
    };
    respond({ ...recorded.album, included: [collision, ...recorded.album.included] });
    expect((await tidalAdapter.getAlbum("20115556")).artworkUrl).toBe(COVER);
  });

  it("does not silently ignore a referenced artwork missing from included", async () => {
    respond({
      ...recorded.album,
      included: recorded.album.included.filter((resource) => resource.type !== "artworks"),
    });
    await expect(tidalAdapter.getAlbum("20115556")).rejects.toThrow();
  });
});
