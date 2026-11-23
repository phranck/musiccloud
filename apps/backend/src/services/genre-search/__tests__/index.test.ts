import { describe, expect, it } from "vitest";
import { isGenreBrowseQuery, isGenreSearchQuery, parseGenreQuery } from "../index.js";

/**
 * Spellings of the `genre:` prefix that `parseGenreQuery` accepts, because it
 * trims the key and compares it case-insensitively.
 */
const ACCEPTED_PREFIX_SPELLINGS = ["genre:", "genre :", "  Genre  :", "GENRE\t:"] as const;

describe("genre query prefix", () => {
  it.each(ACCEPTED_PREFIX_SPELLINGS)("accepts the prefix '%s' for both the search and the browse", (prefix) => {
    const searchQuery = `${prefix} rock`;
    const browseQuery = `${prefix} ?`;

    expect(isGenreBrowseQuery(browseQuery)).toBe(true);
    expect(isGenreSearchQuery(searchQuery)).toBe(true);
    expect(parseGenreQuery(searchQuery).genres).toEqual(["rock"]);
  });

  it("does not treat a query without the prefix as a genre query", () => {
    expect(isGenreSearchQuery("rock")).toBe(false);
    expect(isGenreSearchQuery("genres: rock")).toBe(false);
    expect(isGenreSearchQuery("my genre: rock")).toBe(false);
    expect(isGenreBrowseQuery("genre: rock")).toBe(false);
    expect(isGenreBrowseQuery("genre: ??")).toBe(false);
  });
});
