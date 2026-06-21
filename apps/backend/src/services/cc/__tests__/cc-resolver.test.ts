import { afterEach, describe, expect, it, vi } from "vitest";
import { ccCandidateId, parseCcCandidateId, resolveCcSelectedCandidate, resolveCcTextSearch } from "../cc-resolver.js";
import * as client from "../jamendo/client.js";
import type { CcTrack } from "../jamendo/types.js";

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

afterEach(() => vi.restoreAllMocks());

describe("ccCandidateId / parseCcCandidateId", () => {
  it("round-trips a jamendo id", () => {
    expect(ccCandidateId("1886393")).toBe("jamendo:1886393");
    expect(parseCcCandidateId("jamendo:1886393")).toBe("1886393");
  });
  it("returns null for a non-cc candidate id", () => {
    expect(parseCcCandidateId("spotify:abc")).toBeNull();
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

describe("resolveCcSelectedCandidate", () => {
  it("resolves the selected candidate to a full CcTrack", async () => {
    vi.spyOn(client, "getCcTrack").mockResolvedValue(TRACK);
    const track = await resolveCcSelectedCandidate("jamendo:1886393");
    expect(client.getCcTrack).toHaveBeenCalledWith("1886393");
    expect(track?.jamendoId).toBe("1886393");
  });

  it("throws on a non-cc candidate id", async () => {
    await expect(resolveCcSelectedCandidate("spotify:abc")).rejects.toThrow(/candidate/i);
  });
});
