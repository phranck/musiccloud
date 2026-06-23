import type { ArtistInfoResponse } from "@musiccloud/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the three collaborators so the loader's orchestration is tested in
// isolation: the DB short-id lookup, the live Jamendo fetches, and the shared
// payload builders (which themselves hit Jamendo for the right column).
const findCcShortId = vi.fn();
vi.mock("../../../db/index.js", () => ({ getCcRepository: async () => ({ findCcShortId }) }));

const getCcTrack = vi.fn();
const getCcAlbum = vi.fn();
const getCcAlbumTracks = vi.fn();
const getCcArtist = vi.fn();
const getCcArtistTopTracks = vi.fn();
vi.mock("../../../services/cc/jamendo/client.js", () => ({
  getCcTrack: (...a: unknown[]) => getCcTrack(...a),
  getCcAlbum: (...a: unknown[]) => getCcAlbum(...a),
  getCcAlbumTracks: (...a: unknown[]) => getCcAlbumTracks(...a),
  getCcArtist: (...a: unknown[]) => getCcArtist(...a),
  getCcArtistTopTracks: (...a: unknown[]) => getCcArtistTopTracks(...a),
}));

const buildCcTrackPayload = vi.fn();
const buildCcAlbumPayload = vi.fn();
const buildCcArtistPayload = vi.fn();
const toApiCcTrack = vi.fn((track: unknown) => track);
vi.mock("../../../services/cc/cc-share-response.js", () => ({
  buildCcTrackPayload: (...a: unknown[]) => buildCcTrackPayload(...a),
  buildCcAlbumPayload: (...a: unknown[]) => buildCcAlbumPayload(...a),
  buildCcArtistPayload: (...a: unknown[]) => buildCcArtistPayload(...a),
  toApiCcTrack: (...a: unknown[]) => toApiCcTrack(...a),
}));

const { loadCcByShortId } = await import("../cc-share-page.js");

const ARTIST_INFO: ArtistInfoResponse = {
  artistName: "Madpix",
  topTracks: [],
  profile: null,
  events: [],
};

describe("loadCcByShortId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when the short id matches no CC entity", async () => {
    findCcShortId.mockResolvedValue(null);
    expect(await loadCcByShortId("nope", "https://x.io")).toBeNull();
    expect(getCcTrack).not.toHaveBeenCalled();
  });

  it("shapes a cc-track core response with og, shortUrl and track (artist column loads async)", async () => {
    findCcShortId.mockResolvedValue({ kind: "cc-track", jamendoId: "j1" });
    getCcTrack.mockResolvedValue({ jamendoId: "j1", title: "Moments", artistName: "Madpix" });

    const res = await loadCcByShortId("V0onz", "https://musiccloud.io");

    expect(getCcTrack).toHaveBeenCalledWith("j1");
    expect(toApiCcTrack).toHaveBeenCalledWith({ jamendoId: "j1", title: "Moments", artistName: "Madpix" });
    expect(res).toMatchObject({
      type: "cc-track",
      shortUrl: "https://musiccloud.io/V0onz",
      track: { title: "Moments" },
    });
    expect(res?.og.title).toBe("Moments - Madpix");
    expect(res?.og.url).toBe("https://musiccloud.io/V0onz");
    expect(res).not.toHaveProperty("links");
    // Progressive render: the artist column is fetched client-side, not inlined here.
    expect(res).not.toHaveProperty("artistInfo");
    expect(buildCcTrackPayload).not.toHaveBeenCalled();
  });

  it("fetches the album's tracks live and shapes a cc-album response", async () => {
    findCcShortId.mockResolvedValue({ kind: "cc-album", jamendoId: "a1" });
    getCcAlbum.mockResolvedValue({ jamendoId: "a1", name: "Suite", artistName: "Olepash" });
    getCcAlbumTracks.mockResolvedValue([{ jamendoId: "t1" }, { jamendoId: "t2" }]);
    buildCcAlbumPayload.mockResolvedValue({ album: { name: "Suite", tracks: [{}, {}] }, artistInfo: ARTIST_INFO });

    const res = await loadCcByShortId("8oTIg", "https://musiccloud.io");

    expect(getCcAlbumTracks).toHaveBeenCalledWith("a1");
    expect(buildCcAlbumPayload).toHaveBeenCalledWith({ jamendoId: "a1", name: "Suite", artistName: "Olepash" }, [
      { jamendoId: "t1" },
      { jamendoId: "t2" },
    ]);
    expect(res).toMatchObject({ type: "cc-album", album: { name: "Suite" } });
  });

  it("shapes a cc-artist response from its top tracks", async () => {
    findCcShortId.mockResolvedValue({ kind: "cc-artist", jamendoId: "ar1" });
    getCcArtist.mockResolvedValue({ jamendoId: "ar1", name: "pinegroove" });
    getCcArtistTopTracks.mockResolvedValue([{ jamendoId: "t1" }]);
    buildCcArtistPayload.mockResolvedValue({
      artist: { name: "pinegroove", topTracks: [{}] },
      artistInfo: ARTIST_INFO,
    });

    const res = await loadCcByShortId("N3VoA", "https://musiccloud.io");

    expect(getCcArtistTopTracks).toHaveBeenCalledWith("ar1");
    expect(res).toMatchObject({ type: "cc-artist", artist: { name: "pinegroove" } });
    expect(res?.og.title).toBe("pinegroove - musiccloud");
  });

  it("returns null when the Jamendo entity is gone despite a DB row", async () => {
    findCcShortId.mockResolvedValue({ kind: "cc-track", jamendoId: "j1" });
    getCcTrack.mockResolvedValue(null);
    expect(await loadCcByShortId("V0onz", "https://musiccloud.io")).toBeNull();
    expect(buildCcTrackPayload).not.toHaveBeenCalled();
  });
});
