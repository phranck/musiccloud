import { describe, expect, it } from "vitest";
import { spotifyAdapter } from "../services/adapters/spotify";

// =============================================================================
// detectAlbumUrl
// =============================================================================

describe("Spotify: detectAlbumUrl", () => {
  it("should extract album ID from standard URL", () => {
    expect(spotifyAdapter.detectAlbumUrl?.("https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE")).toBe(
      "6dVIqQ8qmQ5GBnJ9shOYGE",
    );
  });

  it("should extract album ID from intl URL", () => {
    expect(spotifyAdapter.detectAlbumUrl?.("https://open.spotify.com/intl-de/album/6dVIqQ8qmQ5GBnJ9shOYGE")).toBe(
      "6dVIqQ8qmQ5GBnJ9shOYGE",
    );
  });

  it("should extract album ID from play.spotify.com URL", () => {
    expect(spotifyAdapter.detectAlbumUrl?.("https://play.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE")).toBe(
      "6dVIqQ8qmQ5GBnJ9shOYGE",
    );
  });

  it("should return null for track URL", () => {
    expect(spotifyAdapter.detectAlbumUrl?.("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")).toBeNull();
  });

  it("should return null for playlist URL", () => {
    expect(spotifyAdapter.detectAlbumUrl?.("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")).toBeNull();
  });

  it("should return null for non-Spotify URL", () => {
    expect(spotifyAdapter.detectAlbumUrl?.("https://www.deezer.com/album/302127")).toBeNull();
  });
});
