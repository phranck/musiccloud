import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCcAlbum, getCcArtist, getCcTrack, getSimilarCcTracks, searchCcTracks } from "../client.js";
import type { JamendoAlbumRaw, JamendoArtistRaw, JamendoEnvelope, JamendoTrackRaw } from "../types.js";

const SAMPLE_TRACK: JamendoTrackRaw = {
  id: "1886393",
  name: "Sample Title",
  duration: 180,
  artist_id: "338723",
  artist_name: "Sample Artist",
  album_id: "176136",
  album_name: "Sample Album",
  album_image: "https://usercontent.jamendo.com/album.jpg",
  image: "https://usercontent.jamendo.com/track.jpg",
  audio: "https://prod-1.storage.jamendo.com/?trackid=1886393&format=mp31",
  audiodownload: "https://prod-1.storage.jamendo.com/download/track/1886393/mp32/",
  audiodownload_allowed: true,
  license_ccurl: "http://creativecommons.org/licenses/by-nc-nd/3.0/",
  shareurl: "https://www.jamendo.com/track/1886393",
  waveform: '{"peaks":[0,12,40,255]}',
  releasedate: "2020-05-01",
};

function mockJamendo(body: JamendoEnvelope<JamendoTrackRaw>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response),
  );
}

describe("searchCcTracks", () => {
  beforeEach(() => {
    vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps a Jamendo track to a CcTrack (seconds → ms, license, stream, waveform)", async () => {
    mockJamendo({
      headers: { status: "success", code: 0, results_count: 1 },
      results: [SAMPLE_TRACK],
    });

    const tracks = await searchCcTracks({ search: "sample" });

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      jamendoId: "1886393",
      title: "Sample Title",
      artistName: "Sample Artist",
      jamendoArtistId: "338723",
      albumName: "Sample Album",
      durationMs: 180000,
      licenseCcurl: "http://creativecommons.org/licenses/by-nc-nd/3.0/",
      streamUrl: "https://prod-1.storage.jamendo.com/?trackid=1886393&format=mp31",
      downloadAllowed: true,
      waveform: '{"peaks":[0,12,40,255]}',
    });
  });

  it("passes client_id and structured fields to the request URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 0 }, results: [] }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await searchCcTracks({ name: "Enjoy The Silence", artist_name: "Depeche Mode", limit: 5 });

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("client_id=test_client_id");
    expect(calledUrl).toContain("name=Enjoy+The+Silence");
    expect(calledUrl).toContain("artist_name=Depeche+Mode");
    expect(calledUrl).toContain("limit=5");
  });

  it("throws when JAMENDO_CLIENT_ID is missing", async () => {
    vi.unstubAllEnvs();
    await expect(searchCcTracks({ search: "x" })).rejects.toThrow(/JAMENDO_CLIENT_ID/);
  });

  it("throws when the API reports a failed status", async () => {
    mockJamendo({
      headers: { status: "failed", code: 1, error_message: "boom", results_count: 0 },
      results: [],
    });
    await expect(searchCcTracks({ search: "x" })).rejects.toThrow(/boom/);
  });
});

describe("getCcTrack", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the single mapped track for an id", async () => {
    mockJamendo({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] });
    const track = await getCcTrack("1886393");
    expect(track?.jamendoId).toBe("1886393");
    expect(track?.streamUrl).toContain("trackid=1886393");
  });

  it("returns null when no track matches", async () => {
    mockJamendo({ headers: { status: "success", code: 0, results_count: 0 }, results: [] });
    const track = await getCcTrack("does-not-exist");
    expect(track).toBeNull();
  });
});

describe("getSimilarCcTracks", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requests /tracks/similar with the seed id and maps results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const similar = await getSimilarCcTracks("1886393");

    expect(String(fetchMock.mock.calls[0][0])).toContain("/tracks/similar");
    expect(String(fetchMock.mock.calls[0][0])).toContain("id=1886393");
    expect(similar[0]?.jamendoId).toBe("1886393");
  });
});

const SAMPLE_ALBUM: JamendoAlbumRaw = {
  id: "176136",
  name: "Sample Album",
  artist_id: "338723",
  artist_name: "Sample Artist",
  image: "https://usercontent.jamendo.com/album.jpg",
  releasedate: "2020-05-01",
  zip: "https://prod-1.storage.jamendo.com/download/album/176136/mp32/",
  shareurl: "https://www.jamendo.com/album/176136",
};

const SAMPLE_ARTIST: JamendoArtistRaw = {
  id: "338723",
  name: "Sample Artist",
  website: "https://example.org",
  image: "https://usercontent.jamendo.com/artist.jpg",
  shareurl: "https://www.jamendo.com/artist/338723",
};

describe("getCcAlbum", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps a Jamendo album to a CcAlbum", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_ALBUM] }),
      } as Response),
    );
    const album = await getCcAlbum("176136");
    expect(album).toMatchObject({ jamendoId: "176136", name: "Sample Album", jamendoArtistId: "338723", zipUrl: SAMPLE_ALBUM.zip });
  });
});

describe("getCcArtist", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps a Jamendo artist to a CcArtist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_ARTIST] }),
      } as Response),
    );
    const artist = await getCcArtist("338723");
    expect(artist).toMatchObject({ jamendoId: "338723", name: "Sample Artist", website: "https://example.org" });
  });
});
