import { describe, expect, it } from "vitest";
import { detectPlatform, isMusicUrl } from "../lib/utils";

// =============================================================================
// isMusicUrl
// =============================================================================

describe("isMusicUrl", () => {
  describe("valid music URLs", () => {
    it("should detect standard Spotify track URL", () => {
      expect(isMusicUrl("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")).toBe(true);
    });

    it("should detect Spotify international track URL", () => {
      expect(isMusicUrl("https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC")).toBe(true);
    });

    it("should detect Spotify album URL", () => {
      expect(isMusicUrl("https://open.spotify.com/album/1440806041")).toBe(true);
    });

    it("should detect Apple Music URL", () => {
      expect(isMusicUrl("https://music.apple.com/us/album/bohemian-rhapsody/1440806041?i=1440806768")).toBe(true);
    });

    it("should detect standard YouTube URL", () => {
      expect(isMusicUrl("https://www.youtube.com/watch?v=fJ9rUzIMcZQ")).toBe(true);
    });

    it("should detect YouTube short URL", () => {
      expect(isMusicUrl("https://youtu.be/fJ9rUzIMcZQ")).toBe(true);
    });

    it("should detect YouTube Music URL", () => {
      expect(isMusicUrl("https://music.youtube.com/watch?v=fJ9rUzIMcZQ")).toBe(true);
    });

    it("should detect YouTube Shorts URL", () => {
      expect(isMusicUrl("https://www.youtube.com/shorts/abc123")).toBe(true);
    });

    it("should detect Tidal track URL", () => {
      expect(isMusicUrl("https://tidal.com/browse/track/12345")).toBe(true);
    });

    it("should detect Tidal listen URL", () => {
      expect(isMusicUrl("https://listen.tidal.com/track/12345")).toBe(true);
    });

    it("should detect Deezer track URL", () => {
      expect(isMusicUrl("https://www.deezer.com/track/12345")).toBe(true);
    });

    it("should detect Deezer track URL with locale", () => {
      expect(isMusicUrl("https://www.deezer.com/en/track/12345")).toBe(true);
    });
  });

  describe("invalid/unsupported URLs", () => {
    it("should reject Amazon Music URL", () => {
      expect(isMusicUrl("https://music.amazon.com/albums/B07QJR")).toBe(false);
    });

    it("should reject random non-music URL", () => {
      expect(isMusicUrl("https://www.google.com")).toBe(false);
    });

    it("should reject empty string", () => {
      expect(isMusicUrl("")).toBe(false);
    });

    it("should reject plain text", () => {
      expect(isMusicUrl("Bohemian Rhapsody Queen")).toBe(false);
    });
  });
});

// =============================================================================
// detectPlatform
// =============================================================================

describe("detectPlatform", () => {
  it("should identify Spotify platform", () => {
    expect(detectPlatform("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")).toBe("spotify");
  });

  it("should identify Spotify international URL as Spotify", () => {
    expect(detectPlatform("https://open.spotify.com/intl-de/track/abc123")).toBe("spotify");
  });

  it("should identify Apple Music platform", () => {
    expect(detectPlatform("https://music.apple.com/us/album/bohemian-rhapsody/1440806041?i=1440806768")).toBe(
      "apple-music",
    );
  });

  it("should identify YouTube platform from standard URL", () => {
    expect(detectPlatform("https://www.youtube.com/watch?v=fJ9rUzIMcZQ")).toBe("youtube");
  });

  it("should identify YouTube platform from short URL", () => {
    expect(detectPlatform("https://youtu.be/fJ9rUzIMcZQ")).toBe("youtube");
  });

  it("should identify YouTube Music as YouTube", () => {
    expect(detectPlatform("https://music.youtube.com/watch?v=fJ9rUzIMcZQ")).toBe("youtube");
  });

  it("should identify Tidal platform", () => {
    expect(detectPlatform("https://tidal.com/browse/track/12345")).toBe("tidal");
  });

  it("should identify Tidal listen URL as Tidal", () => {
    expect(detectPlatform("https://listen.tidal.com/track/12345")).toBe("tidal");
  });

  it("should identify Deezer platform", () => {
    expect(detectPlatform("https://www.deezer.com/track/12345")).toBe("deezer");
  });

  it("should identify Deezer URL with locale", () => {
    expect(detectPlatform("https://www.deezer.com/en/track/12345")).toBe("deezer");
  });

  it("should return null for unsupported platform", () => {
    expect(detectPlatform("https://music.amazon.com/albums/B07QJR")).toBeNull();
  });

  it("should return null for non-URL input", () => {
    expect(detectPlatform("Bohemian Rhapsody")).toBeNull();
  });
});
