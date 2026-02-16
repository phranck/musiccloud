import { describe, it, expect } from "vitest";
import { spotifyAdapter } from "../services/adapters/spotify";
import { appleMusicAdapter } from "../services/adapters/apple-music";
import { youtubeAdapter } from "../services/adapters/youtube";

// =============================================================================
// Spotify adapter: detectUrl
// =============================================================================

describe("Spotify: detectUrl", () => {
  it("should extract track ID from standard URL", () => {
    expect(
      spotifyAdapter.detectUrl("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"),
    ).toBe("4uLU6hMCjMI75M1A2tKUQC");
  });

  it("should extract track ID from international URL", () => {
    expect(
      spotifyAdapter.detectUrl("https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC"),
    ).toBe("4uLU6hMCjMI75M1A2tKUQC");
  });

  it("should extract track ID from URL with query params", () => {
    expect(
      spotifyAdapter.detectUrl("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123"),
    ).toBe("4uLU6hMCjMI75M1A2tKUQC");
  });

  it("should extract track ID from Spotify URI", () => {
    expect(
      spotifyAdapter.detectUrl("spotify:track:4uLU6hMCjMI75M1A2tKUQC"),
    ).toBe("4uLU6hMCjMI75M1A2tKUQC");
  });

  it("should return null for playlist URL", () => {
    expect(
      spotifyAdapter.detectUrl("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"),
    ).toBeNull();
  });

  it("should return null for album URL", () => {
    expect(
      spotifyAdapter.detectUrl("https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx"),
    ).toBeNull();
  });

  it("should return null for podcast episode URL", () => {
    expect(
      spotifyAdapter.detectUrl("https://open.spotify.com/episode/abc123"),
    ).toBeNull();
  });

  it("should return null for non-Spotify URL", () => {
    expect(
      spotifyAdapter.detectUrl("https://music.apple.com/us/album/bohemian/123"),
    ).toBeNull();
  });
});

// =============================================================================
// Apple Music adapter: detectUrl
// =============================================================================

describe("Apple Music: detectUrl", () => {
  it("should extract track ID from album URL with ?i= param", () => {
    expect(
      appleMusicAdapter.detectUrl("https://music.apple.com/us/album/bohemian-rhapsody/1440806041?i=1440806768"),
    ).toBe("1440806768");
  });

  it("should extract track ID from direct song URL", () => {
    expect(
      appleMusicAdapter.detectUrl("https://music.apple.com/us/song/bohemian-rhapsody/1440806768"),
    ).toBe("1440806768");
  });

  it("should handle regional URLs (German store)", () => {
    expect(
      appleMusicAdapter.detectUrl("https://music.apple.com/de/album/bohemian-rhapsody/1440806041?i=1440806768"),
    ).toBe("1440806768");
  });

  it("should return null for album-only URL (no ?i= param)", () => {
    expect(
      appleMusicAdapter.detectUrl("https://music.apple.com/us/album/a-night-at-the-opera/1440806041"),
    ).toBeNull();
  });

  it("should return null for non-Apple Music URL", () => {
    expect(
      appleMusicAdapter.detectUrl("https://open.spotify.com/track/abc123"),
    ).toBeNull();
  });
});

// =============================================================================
// YouTube adapter: detectUrl
// =============================================================================

describe("YouTube: detectUrl", () => {
  it("should extract video ID from standard URL", () => {
    expect(
      youtubeAdapter.detectUrl("https://www.youtube.com/watch?v=fJ9rUzIMcZQ"),
    ).toBe("fJ9rUzIMcZQ");
  });

  it("should extract video ID from short URL", () => {
    expect(
      youtubeAdapter.detectUrl("https://youtu.be/fJ9rUzIMcZQ"),
    ).toBe("fJ9rUzIMcZQ");
  });

  it("should extract video ID from YouTube Music URL", () => {
    expect(
      youtubeAdapter.detectUrl("https://music.youtube.com/watch?v=fJ9rUzIMcZQ"),
    ).toBe("fJ9rUzIMcZQ");
  });

  it("should return null for playlist URL", () => {
    expect(
      youtubeAdapter.detectUrl("https://www.youtube.com/playlist?list=PLrAXtmErZgOe123"),
    ).toBeNull();
  });

  it("should return null for channel URL", () => {
    expect(
      youtubeAdapter.detectUrl("https://www.youtube.com/channel/UCxxxxxxx"),
    ).toBeNull();
  });

  it("should return null for non-YouTube URL", () => {
    expect(
      youtubeAdapter.detectUrl("https://open.spotify.com/track/abc123"),
    ).toBeNull();
  });
});
