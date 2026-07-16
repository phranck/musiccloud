import { afterEach, describe, expect, it, vi } from "vitest";
import { runCcGenreBrowse, runCcGenreSearch } from "../cc-genre.js";
import * as client from "../jamendo/client.js";
import type { CcArtist, CcGenre, CcTrack } from "../jamendo/types.js";

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

/** Three rows where A and B share artist `a1` + album `al1`, C is distinct. */
const TRACK_A: CcTrack = {
  jamendoId: "t1",
  title: "Track A",
  artistName: "Artist One",
  jamendoArtistId: "a1",
  albumName: "Album One",
  jamendoAlbumId: "al1",
  artworkUrl: "https://usercontent.jamendo.com/a.jpg",
  durationMs: 100000,
  streamUrl: "https://prod-1.storage.jamendo.com/?trackid=t1",
  downloadAllowed: false,
  shareUrl: "https://www.jamendo.com/track/t1",
};
const TRACK_B: CcTrack = {
  ...TRACK_A,
  jamendoId: "t2",
  title: "Track B",
  shareUrl: "https://www.jamendo.com/track/t2",
};
const TRACK_C: CcTrack = {
  ...TRACK_A,
  jamendoId: "t3",
  title: "Track C",
  artistName: "Artist Two",
  jamendoArtistId: "a2",
  albumName: "Album Two",
  jamendoAlbumId: "al2",
  shareUrl: "https://www.jamendo.com/track/t3",
};

const ARTIST_A1: CcArtist = {
  jamendoId: "a1",
  name: "Artist One",
  imageUrl: "https://usercontent.jamendo.com/artist-a1.jpg",
  shareUrl: "https://www.jamendo.com/artist/a1",
};
const ARTIST_A2: CcArtist = {
  jamendoId: "a2",
  name: "Artist Two",
  imageUrl: "https://usercontent.jamendo.com/artist-a2.jpg",
  shareUrl: "https://www.jamendo.com/artist/a2",
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
  it("a per-type tracks-only query fills the tracks column and leaves albums/artists null", async () => {
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
  });

  it("derives deduped album and artist columns from the track rows, enriching artists by id", async () => {
    const tracksSpy = vi.spyOn(client, "searchCcTracks").mockResolvedValue([TRACK_A, TRACK_B, TRACK_C]);
    // Jamendo returns the enrichment in arbitrary order — reversed here on purpose.
    const artistsSpy = vi.spyOn(client, "getCcArtistsByIds").mockResolvedValue([ARTIST_A2, ARTIST_A1]);

    const response = await runCcGenreSearch("genre: jazz");

    // Default query → all three counts default to 10; over-fetch is 10*3 = 30.
    expect(tracksSpy).toHaveBeenCalledWith(expect.objectContaining({ tags: "jazz", limit: 30 }));
    expect(response.query).toEqual({ genres: ["jazz"], vibe: "hot", tracks: 10, albums: 10, artists: 10 });

    // Albums deduped by album id (A and B collapse to al1), in track order.
    expect(response.results.albums).toEqual([
      {
        id: "jamendo-album:al1",
        title: "Album One",
        artists: ["Artist One"],
        artworkUrl: "https://usercontent.jamendo.com/a.jpg",
      },
      {
        id: "jamendo-album:al2",
        title: "Album Two",
        artists: ["Artist Two"],
        artworkUrl: "https://usercontent.jamendo.com/a.jpg",
      },
    ]);

    // Artists deduped by artist id, enriched with image + share url matched by id.
    expect(artistsSpy).toHaveBeenCalledWith(["a1", "a2"]);
    expect(response.results.artists).toEqual([
      {
        id: "jamendo-artist:a1",
        name: "Artist One",
        imageUrl: "https://usercontent.jamendo.com/artist-a1.jpg",
        webUrl: "https://www.jamendo.com/artist/a1",
      },
      {
        id: "jamendo-artist:a2",
        name: "Artist Two",
        imageUrl: "https://usercontent.jamendo.com/artist-a2.jpg",
        webUrl: "https://www.jamendo.com/artist/a2",
      },
    ]);
    expect(response.results.tracks).toHaveLength(3);
  });

  it("OR-combines multiple genres into a '+'-joined tag and over-fetches for the default counts", async () => {
    const spy = vi.spyOn(client, "searchCcTracks").mockResolvedValue([]);
    vi.spyOn(client, "getCcArtistsByIds").mockResolvedValue([]);

    await runCcGenreSearch("genre: jazz|rock");

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ tags: "jazz+rock", limit: 30 }));
  });

  it("propagates GenreQueryParseError for an invalid query", async () => {
    await expect(runCcGenreSearch("genre:")).rejects.toThrow(/genre/i);
  });
});
