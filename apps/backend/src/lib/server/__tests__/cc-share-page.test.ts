import type { ArtistInfoResponse } from "@musiccloud/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The loader reads every CC entity straight from the DB (no live Jamendo on the
// open path). Mock the repo's short-id lookup + entity reads and the shared
// payload/row-mapping helpers so the loader's orchestration is tested in isolation.
const findCcShortId = vi.fn();
const loadCcTrackByShortId = vi.fn();
const loadCcAlbumByShortId = vi.fn();
const loadCcArtistByShortId = vi.fn();
vi.mock("../../../db/index.js", () => ({
  getCcRepository: async () => ({ findCcShortId, loadCcTrackByShortId, loadCcAlbumByShortId, loadCcArtistByShortId }),
}));

const buildCcAlbumPayload = vi.fn();
const buildCcArtistPayload = vi.fn();
const toApiCcTrack = vi.fn((track: unknown) => track);
// Row mappers are mocked as identity passthroughs so the loader's wiring (which
// row feeds which builder) is asserted directly on the DB rows.
const mapDbRowToCcTrack = vi.fn((row: unknown) => row);
const mapDbRowToCcAlbum = vi.fn((row: unknown) => row);
const mapDbRowToCcArtist = vi.fn((row: unknown) => row);
vi.mock("../../../services/cc/cc-share-response.js", () => ({
  buildCcAlbumPayload: (...a: unknown[]) => buildCcAlbumPayload(...a),
  buildCcArtistPayload: (...a: unknown[]) => buildCcArtistPayload(...a),
  toApiCcTrack: (...a: unknown[]) => toApiCcTrack(...a),
  mapDbRowToCcTrack: (...a: unknown[]) => mapDbRowToCcTrack(...a),
  mapDbRowToCcAlbum: (...a: unknown[]) => mapDbRowToCcAlbum(...a),
  mapDbRowToCcArtist: (...a: unknown[]) => mapDbRowToCcArtist(...a),
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
    expect(loadCcTrackByShortId).not.toHaveBeenCalled();
  });

  it("shapes a cc-track core response from the DB row (artist column loads async)", async () => {
    findCcShortId.mockResolvedValue({ kind: "cc-track", jamendoId: "j1" });
    loadCcTrackByShortId.mockResolvedValue({ jamendoId: "j1", title: "Moments", artistName: "Madpix" });

    const res = await loadCcByShortId("V0onz", "https://musiccloud.io");

    expect(loadCcTrackByShortId).toHaveBeenCalledWith("V0onz");
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
    expect(buildCcAlbumPayload).not.toHaveBeenCalled();
  });

  it("returns null when the cc-track row is gone despite a short-id lookup", async () => {
    findCcShortId.mockResolvedValue({ kind: "cc-track", jamendoId: "j1" });
    loadCcTrackByShortId.mockResolvedValue(null);
    expect(await loadCcByShortId("V0onz", "https://musiccloud.io")).toBeNull();
    expect(toApiCcTrack).not.toHaveBeenCalled();
  });

  it("shapes a cc-album response from the DB tracklist", async () => {
    findCcShortId.mockResolvedValue({ kind: "cc-album", jamendoId: "a1" });
    loadCcAlbumByShortId.mockResolvedValue({
      album: { jamendoId: "a1", name: "Suite", artistName: "Olepash" },
      tracks: [{ jamendoId: "t1" }, { jamendoId: "t2" }],
    });
    buildCcAlbumPayload.mockResolvedValue({ album: { name: "Suite", tracks: [{}, {}] }, artistInfo: ARTIST_INFO });

    const res = await loadCcByShortId("8oTIg", "https://musiccloud.io");

    expect(loadCcAlbumByShortId).toHaveBeenCalledWith("8oTIg");
    expect(buildCcAlbumPayload).toHaveBeenCalledWith({ jamendoId: "a1", name: "Suite", artistName: "Olepash" }, [
      { jamendoId: "t1" },
      { jamendoId: "t2" },
    ]);
    expect(res).toMatchObject({ type: "cc-album", album: { name: "Suite" } });
  });

  it("returns null when the cc-album row is gone", async () => {
    findCcShortId.mockResolvedValue({ kind: "cc-album", jamendoId: "a1" });
    loadCcAlbumByShortId.mockResolvedValue(null);
    expect(await loadCcByShortId("8oTIg", "https://musiccloud.io")).toBeNull();
    expect(buildCcAlbumPayload).not.toHaveBeenCalled();
  });

  it("shapes a cc-artist response from its DB top tracks", async () => {
    findCcShortId.mockResolvedValue({ kind: "cc-artist", jamendoId: "ar1" });
    loadCcArtistByShortId.mockResolvedValue({
      artist: { jamendoId: "ar1", name: "pinegroove" },
      topTracks: [{ jamendoId: "t1" }],
    });
    buildCcArtistPayload.mockResolvedValue({
      artist: { name: "pinegroove", topTracks: [{}] },
      artistInfo: ARTIST_INFO,
    });

    const res = await loadCcByShortId("N3VoA", "https://musiccloud.io");

    expect(loadCcArtistByShortId).toHaveBeenCalledWith("N3VoA");
    expect(buildCcArtistPayload).toHaveBeenCalledWith({ jamendoId: "ar1", name: "pinegroove" }, [{ jamendoId: "t1" }]);
    expect(res).toMatchObject({ type: "cc-artist", artist: { name: "pinegroove" } });
    expect(res?.og.title).toBe("pinegroove - musiccloud");
  });

  it("returns null when the cc-artist row is gone", async () => {
    findCcShortId.mockResolvedValue({ kind: "cc-artist", jamendoId: "ar1" });
    loadCcArtistByShortId.mockResolvedValue(null);
    expect(await loadCcByShortId("N3VoA", "https://musiccloud.io")).toBeNull();
    expect(buildCcArtistPayload).not.toHaveBeenCalled();
  });
});
