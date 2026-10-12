import { describe, expect, it } from "vitest";
import {
  ccGenreArtworkTileUrl,
  GENRE_ARTWORK_VERSION,
  genreArtworkCacheControl,
  genreArtworkTileUrl,
  genreDisplayName,
  isValidGenreKey,
  normalizeGenreKey,
} from "../genre-key.js";

describe("genre artwork keys and addresses", () => {
  it("normalizes a path segment the way artworks are stored", () => {
    expect(normalizeGenreKey("Drum%20%20%26%20Bass ")).toBe("drum & bass");
  });

  it("accepts the keys the generator can name and refuses the rest", () => {
    expect(isValidGenreKey("drum & bass")).toBe(true);
    expect(isValidGenreKey("post-punk/new wave")).toBe(false);
    expect(isValidGenreKey("métal")).toBe(false);
  });

  it("capitalizes every word for the label and the baked text alike", () => {
    expect(genreDisplayName("hip hop")).toBe("Hip Hop");
  });

  it("caches a stable artwork for good and a fallback not at all", () => {
    expect(genreArtworkCacheControl(false)).toBe("public, max-age=31536000, immutable");
    expect(genreArtworkCacheControl(true)).toBe("no-store");
  });

  it("versions commercial and CC tiles with the same value", () => {
    expect(genreArtworkTileUrl("hip hop")).toBe(`/api/genre-artwork/hip%20hop?v=${GENRE_ARTWORK_VERSION}`);
    expect(ccGenreArtworkTileUrl("hip hop")).toBe(`/api/cc/genre-artwork/hip%20hop?v=${GENRE_ARTWORK_VERSION}`);
  });
});
