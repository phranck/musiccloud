import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCcArtistInfo } from "../cc-artist-info.js";
import * as client from "../jamendo/client.js";
import type { CcTrack } from "../jamendo/types.js";

function makeTrack(id: string, artistId: string, name: string): CcTrack {
  return {
    jamendoId: id,
    title: `Track ${id}`,
    artistName: name,
    jamendoArtistId: artistId,
    artworkUrl: `https://usercontent.jamendo.com/${id}.jpg`,
    durationMs: 120000,
    streamUrl: `https://prod.storage.jamendo.com/?trackid=${id}`,
    downloadAllowed: false,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("buildCcArtistInfo", () => {
  it("maps column tracks to topTracks with jamendo: candidate ids in the deezerUrl slot", async () => {
    vi.spyOn(client, "getSimilarCcTracks").mockResolvedValue([]);
    vi.spyOn(client, "getCcArtistMusicInfo").mockResolvedValue(null);

    const info = await buildCcArtistInfo("Artist One", "a1", [
      makeTrack("1", "a1", "Artist One"),
      makeTrack("2", "a1", "Artist One"),
    ]);

    expect(info.artistName).toBe("Artist One");
    expect(info.profile).toBeNull();
    expect(info.events).toEqual([]);
    expect(info.topTracks).toHaveLength(2);
    expect(info.topTracks[0]).toMatchObject({ deezerUrl: "jamendo:1", artists: ["Artist One"], shortId: null });
  });

  it("builds the profile from Jamendo musicinfo, leaving listener counts null and similarArtists empty", async () => {
    vi.spyOn(client, "getSimilarCcTracks").mockResolvedValue([]);
    const musicInfoSpy = vi.spyOn(client, "getCcArtistMusicInfo").mockResolvedValue({
      imageUrl: "https://usercontent.jamendo.com/artist.jpg",
      genres: ["jazz", "piano"],
      bioSummary: "An English bio.",
    });

    const info = await buildCcArtistInfo("Artist One", "a1", [makeTrack("1", "a1", "Artist One")]);

    expect(musicInfoSpy).toHaveBeenCalledWith("a1");
    expect(info.profile).toEqual({
      imageUrl: "https://usercontent.jamendo.com/artist.jpg",
      genres: ["jazz", "piano"],
      bioSummary: "An English bio.",
      popularity: null,
      followers: null,
      scrobbles: null,
      similarArtists: [],
    });
  });

  it("similarArtistTracks are tracks by OTHER artists, seeded by the first column track", async () => {
    const similarSpy = vi.spyOn(client, "getSimilarCcTracks").mockResolvedValue([
      makeTrack("s1", "a1", "Artist One"), // same artist as seed → filtered out
      makeTrack("s2", "a2", "Artist Two"),
      makeTrack("s3", "a3", "Artist Three"),
    ]);
    vi.spyOn(client, "getCcArtistMusicInfo").mockResolvedValue(null);

    const info = await buildCcArtistInfo("Artist One", "a1", [makeTrack("1", "a1", "Artist One")]);

    expect(similarSpy).toHaveBeenCalledWith("1", expect.any(Number));
    expect(info.similarArtistTracks?.map((s) => s.artistName)).toEqual(["Artist Two", "Artist Three"]);
    expect(info.similarArtistTracks?.[0].track?.deezerUrl).toBe("jamendo:s2");
  });

  it("skips the similar fetch when there are no column tracks", async () => {
    const similarSpy = vi.spyOn(client, "getSimilarCcTracks").mockResolvedValue([]);
    vi.spyOn(client, "getCcArtistMusicInfo").mockResolvedValue(null);

    const info = await buildCcArtistInfo("Nobody", "a1", []);

    expect(similarSpy).not.toHaveBeenCalled();
    expect(info.topTracks).toEqual([]);
    expect(info.similarArtistTracks).toEqual([]);
  });
});
