import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ccCandidateId,
  parseCcAlbumCandidateId,
  parseCcArtistCandidateId,
  parseCcCandidateId,
  resolveCcCandidate,
  resolveCcTextSearch,
} from "../cc-resolver.js";
import * as client from "../jamendo/client.js";
import type { CcAlbum, CcArtist, CcTrack } from "../jamendo/types.js";

const TRACK: CcTrack = {
  jamendoId: "1886393",
  title: "Sample Title",
  artistName: "Sample Artist",
  jamendoArtistId: "338723",
  albumName: "Sample Album",
  jamendoAlbumId: "176136",
  artworkUrl: "https://usercontent.jamendo.com/track.jpg",
  durationMs: 180000,
  licenseCcurl: "http://creativecommons.org/licenses/by-nc-nd/3.0/",
  streamUrl: "https://prod-1.storage.jamendo.com/?trackid=1886393&format=mp31",
  downloadAllowed: true,
  shareUrl: "https://www.jamendo.com/track/1886393",
};

const ALBUM: CcAlbum = {
  jamendoId: "176136",
  name: "Sample Album",
  jamendoArtistId: "338723",
  artistName: "Sample Artist",
  artworkUrl: "https://usercontent.jamendo.com/album.jpg",
  releaseDate: "2012-04-12",
  shareUrl: "https://www.jamendo.com/album/176136",
};

const ARTIST: CcArtist = {
  jamendoId: "338723",
  name: "Sample Artist",
  imageUrl: "https://usercontent.jamendo.com/artist.jpg",
  shareUrl: "https://www.jamendo.com/artist/338723",
};

afterEach(() => vi.restoreAllMocks());

describe("ccCandidateId / parseCcCandidateId", () => {
  it("round-trips a jamendo id", () => {
    expect(ccCandidateId("1886393")).toBe("jamendo:1886393");
    expect(parseCcCandidateId("jamendo:1886393")).toBe("1886393");
  });
  it("returns null for a non-cc candidate id", () => {
    expect(parseCcCandidateId("spotify:abc")).toBeNull();
  });
  it("does not match the album/artist prefixes (disjoint)", () => {
    expect(parseCcCandidateId("jamendo-album:176136")).toBeNull();
    expect(parseCcCandidateId("jamendo-artist:338723")).toBeNull();
  });
});

describe("parseCcAlbumCandidateId / parseCcArtistCandidateId", () => {
  it("extracts the album id and rejects other prefixes", () => {
    expect(parseCcAlbumCandidateId("jamendo-album:176136")).toBe("176136");
    expect(parseCcAlbumCandidateId("jamendo:1886393")).toBeNull();
    expect(parseCcAlbumCandidateId("jamendo-artist:338723")).toBeNull();
  });
  it("extracts the artist id and rejects other prefixes", () => {
    expect(parseCcArtistCandidateId("jamendo-artist:338723")).toBe("338723");
    expect(parseCcArtistCandidateId("jamendo:1886393")).toBeNull();
    expect(parseCcArtistCandidateId("jamendo-album:176136")).toBeNull();
  });
});

describe("resolveCcTextSearch", () => {
  it("maps free-text search hits to disambiguation candidates", async () => {
    vi.spyOn(client, "searchCcTracks").mockResolvedValue([TRACK]);
    const result = await resolveCcTextSearch("sample");
    expect(client.searchCcTracks).toHaveBeenCalledWith(expect.objectContaining({ search: "sample" }));
    expect(result.candidates).toEqual([
      {
        id: "jamendo:1886393",
        title: "Sample Title",
        artists: ["Sample Artist"],
        albumName: "Sample Album",
        artworkUrl: "https://usercontent.jamendo.com/track.jpg",
      },
    ]);
  });

  it("routes a structured query through the structured fields", async () => {
    const spy = vi.spyOn(client, "searchCcTracks").mockResolvedValue([]);
    await resolveCcTextSearch("title: Enjoy The Silence, artist: Depeche Mode");
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Enjoy The Silence", artist_name: "Depeche Mode" }),
    );
  });
});

describe("resolveCcCandidate", () => {
  it("resolves a track candidate to a kind:'track' result", async () => {
    vi.spyOn(client, "getCcTrack").mockResolvedValue(TRACK);
    const resolved = await resolveCcCandidate("jamendo:1886393");
    expect(client.getCcTrack).toHaveBeenCalledWith("1886393");
    expect(resolved).toEqual({ kind: "track", track: TRACK });
  });

  it("resolves an album candidate to its entity plus live track list", async () => {
    const albumSpy = vi.spyOn(client, "getCcAlbum").mockResolvedValue(ALBUM);
    const tracksSpy = vi.spyOn(client, "getCcAlbumTracks").mockResolvedValue([TRACK]);
    const resolved = await resolveCcCandidate("jamendo-album:176136");
    expect(albumSpy).toHaveBeenCalledWith("176136");
    expect(tracksSpy).toHaveBeenCalledWith("176136");
    expect(resolved).toEqual({ kind: "album", album: ALBUM, tracks: [TRACK] });
  });

  it("resolves an artist candidate to its entity plus live top tracks", async () => {
    const artistSpy = vi.spyOn(client, "getCcArtist").mockResolvedValue(ARTIST);
    const topSpy = vi.spyOn(client, "getCcArtistTopTracks").mockResolvedValue([TRACK]);
    const resolved = await resolveCcCandidate("jamendo-artist:338723");
    expect(artistSpy).toHaveBeenCalledWith("338723");
    expect(topSpy).toHaveBeenCalledWith("338723");
    expect(resolved).toEqual({ kind: "artist", artist: ARTIST, topTracks: [TRACK] });
  });

  it("returns null and skips the track fetch when the album is gone", async () => {
    vi.spyOn(client, "getCcAlbum").mockResolvedValue(null);
    const tracksSpy = vi.spyOn(client, "getCcAlbumTracks").mockResolvedValue([TRACK]);
    const resolved = await resolveCcCandidate("jamendo-album:176136");
    expect(resolved).toBeNull();
    expect(tracksSpy).not.toHaveBeenCalled();
  });

  it("throws on a non-cc candidate id", async () => {
    await expect(resolveCcCandidate("spotify:abc")).rejects.toThrow(/candidate/i);
  });
});
