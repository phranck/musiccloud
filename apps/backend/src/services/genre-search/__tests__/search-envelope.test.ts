import { describe, expect, it, vi } from "vitest";
import { parseGenreQuery } from "../parser.js";
import { buildGenreSearchEnvelope } from "../search-envelope.js";

/** The count the query requests for every column before the per-type keys override it. */
const REQUESTED_COUNT = 9;

/** The track count the query requests. */
const REQUESTED_TRACKS = 4;

/** The artist count the query requests. */
const REQUESTED_ARTISTS = 2;

describe("buildGenreSearchEnvelope", () => {
  it("echoes the query, fills only the requested columns with their counts, and keeps the warnings", async () => {
    const parsed = parseGenreQuery(
      `genre: jazz|rock, vibe: mixed, count: ${REQUESTED_COUNT}, tracks: ${REQUESTED_TRACKS}, artists: ${REQUESTED_ARTISTS}`,
    );
    const tracks = vi.fn((count: number) => [`track x${count}`]);
    const albums = vi.fn((count: number) => [`album x${count}`]);
    const artists = vi.fn(async (count: number) => [`artist x${count}`]);

    const response = await buildGenreSearchEnvelope(parsed, { tracks, albums, artists });

    expect(response).toEqual({
      status: "genre-search",
      query: {
        genres: ["jazz", "rock"],
        vibe: "mixed",
        tracks: REQUESTED_TRACKS,
        albums: REQUESTED_COUNT,
        artists: REQUESTED_ARTISTS,
      },
      results: {
        tracks: [`track x${REQUESTED_TRACKS}`],
        albums: [`album x${REQUESTED_COUNT}`],
        artists: [`artist x${REQUESTED_ARTISTS}`],
      },
      warnings: parsed.warnings,
    });
    expect(response.warnings).toHaveLength(1);
  });

  it("does not call the producer of a column the query did not request", async () => {
    const parsed = parseGenreQuery(`genre: jazz, tracks: ${REQUESTED_TRACKS}`);
    const albums = vi.fn(() => []);
    const artists = vi.fn(() => []);

    const response = await buildGenreSearchEnvelope(parsed, { tracks: () => ["track"], albums, artists });

    expect(response.results).toEqual({ tracks: ["track"], albums: null, artists: null });
    expect(albums).not.toHaveBeenCalled();
    expect(artists).not.toHaveBeenCalled();
  });
});
