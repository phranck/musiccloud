import { afterEach, describe, expect, it, vi } from "vitest";
import { runCcGenreBrowse, runCcGenreSearch } from "../cc-genre.js";
import * as client from "../jamendo/client.js";
import type { CcGenre, CcTrack } from "../jamendo/types.js";

const GENRES: CcGenre[] = [
  { name: "jazz", displayName: "Jazz" },
  { name: "rock", displayName: "Rock" },
];

const TRACK: CcTrack = {
  jamendoId: "1886393",
  title: "Sample Title",
  artistName: "Sample Artist",
  jamendoArtistId: "338723",
  albumName: "Sample Album",
  artworkUrl: "https://usercontent.jamendo.com/track.jpg",
  durationMs: 180000,
  licenseCcurl: "http://creativecommons.org/licenses/by-nc-nd/3.0/",
  streamUrl: "https://prod-1.storage.jamendo.com/?trackid=1886393&format=mp31",
  downloadAllowed: true,
  shareUrl: "https://www.jamendo.com/track/1886393",
};

afterEach(() => vi.restoreAllMocks());

describe("runCcGenreBrowse", () => {
  it("maps Jamendo genres to browse tiles with versioned CC artwork URLs (no accentColor)", async () => {
    vi.spyOn(client, "getCcGenres").mockResolvedValue(GENRES);

    const response = await runCcGenreBrowse();

    expect(response.status).toBe("genre-browse");
    expect(response.genres).toEqual([
      { name: "jazz", displayName: "Jazz", artworkUrl: "/api/cc/genre-artwork/jazz?v=5" },
      { name: "rock", displayName: "Rock", artworkUrl: "/api/cc/genre-artwork/rock?v=5" },
    ]);
    expect(response.genres.every((tile) => !("accentColor" in tile))).toBe(true);
  });
});

describe("runCcGenreSearch", () => {
  it("queries Jamendo by tag and maps tracks with jamendo: ids, albums/artists null", async () => {
    const spy = vi.spyOn(client, "searchCcTracks").mockResolvedValue([TRACK]);

    const response = await runCcGenreSearch("genre: jazz, tracks: 5");

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ tags: "jazz", limit: 5 }));
    expect(response.status).toBe("genre-search");
    expect(response.query).toEqual({
      genres: ["jazz"],
      vibe: "hot",
      tracks: 5,
      albums: null,
      artists: null,
    });
    expect(response.results.albums).toBeNull();
    expect(response.results.artists).toBeNull();
    expect(response.results.tracks).toEqual([
      {
        id: "jamendo:1886393",
        title: "Sample Title",
        artists: ["Sample Artist"],
        albumName: "Sample Album",
        artworkUrl: "https://usercontent.jamendo.com/track.jpg",
        durationMs: 180000,
        webUrl: "https://www.jamendo.com/track/1886393",
      },
    ]);
    expect(response.results.tracks?.[0]?.id.startsWith("jamendo:")).toBe(true);
  });

  it("OR-combines multiple genres into a '+'-joined tag and defaults to 10 tracks", async () => {
    const spy = vi.spyOn(client, "searchCcTracks").mockResolvedValue([]);

    await runCcGenreSearch("genre: jazz|rock");

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ tags: "jazz+rock", limit: 10 }));
  });

  it("propagates GenreQueryParseError for an invalid query", async () => {
    await expect(runCcGenreSearch("genre:")).rejects.toThrow(/genre/i);
  });
});
