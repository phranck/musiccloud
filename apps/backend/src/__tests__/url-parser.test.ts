import { describe, expect, it } from "vitest";
import { isAlbumUrl, isUrl, stripTrackingParams, validateMusicUrl } from "@/lib/platform/url";

// =============================================================================
// validateMusicUrl
// =============================================================================

describe("validateMusicUrl", () => {
  describe("valid inputs", () => {
    it("should accept Spotify track URL", () => {
      expect(validateMusicUrl("https://open.spotify.com/track/abc123")).toEqual({ valid: true });
    });

    it("should accept Apple Music URL", () => {
      expect(validateMusicUrl("https://music.apple.com/us/album/bohemian/123?i=456")).toEqual({ valid: true });
    });

    it("should accept YouTube URL", () => {
      expect(validateMusicUrl("https://www.youtube.com/watch?v=fJ9rUzIMcZQ")).toEqual({ valid: true });
    });

    it("should accept plain text as valid (triggers text search)", () => {
      expect(validateMusicUrl("Bohemian Rhapsody Queen")).toEqual({ valid: true });
    });

    it("should accept Apple Music album URL with ?i= track param", () => {
      expect(validateMusicUrl("https://music.apple.com/us/album/name/123?i=456")).toEqual({ valid: true });
    });

    it("should accept SoundCloud short URL (on.soundcloud.com)", () => {
      expect(validateMusicUrl("https://on.soundcloud.com/BOT0GlrIxJ3iGawWmK")).toEqual({ valid: true });
    });
  });

  describe("unsupported content types", () => {
    it("should reject Spotify podcast episode", () => {
      const result = validateMusicUrl("https://open.spotify.com/episode/abc123");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe("PODCAST_NOT_SUPPORTED");
      }
    });

    it("should reject Spotify show", () => {
      const result = validateMusicUrl("https://open.spotify.com/show/abc123");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe("PODCAST_NOT_SUPPORTED");
      }
    });

    it("should reject Spotify playlist", () => {
      const result = validateMusicUrl("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe("PLAYLIST_NOT_SUPPORTED");
      }
    });

    it("should accept Spotify album URL (album resolution supported)", () => {
      const result = validateMusicUrl("https://open.spotify.com/album/abc123");
      expect(result.valid).toBe(true);
    });

    it("should accept Deezer album URL", () => {
      const result = validateMusicUrl("https://www.deezer.com/album/123456");
      expect(result.valid).toBe(true);
    });

    it("should accept Tidal album URL", () => {
      const result = validateMusicUrl("https://tidal.com/browse/album/12345");
      expect(result.valid).toBe(true);
    });

    it("should reject YouTube Music album playlist (OLAK5uy_) as playlist", () => {
      // YouTube Music albums are routed via the album resolver, not rejected
      const result = validateMusicUrl("https://music.youtube.com/playlist?list=OLAK5uy_abc123");
      expect(result.valid).toBe(true);
    });

    it("should still reject regular YouTube playlists", () => {
      const result = validateMusicUrl("https://youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe("PLAYLIST_NOT_SUPPORTED");
      }
    });
  });

  describe("unsupported hosts", () => {
    it("should accept Tidal URL", () => {
      const result = validateMusicUrl("https://tidal.com/track/12345");
      expect(result.valid).toBe(true);
    });

    it("should reject random URL", () => {
      const result = validateMusicUrl("https://www.google.com/search?q=music");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe("UNSUPPORTED_SERVICE");
      }
    });
  });
});

// =============================================================================
// stripTrackingParams
// =============================================================================

describe("stripTrackingParams", () => {
  it("should strip UTM parameters", () => {
    const url = "https://open.spotify.com/track/abc123?utm_source=copy&utm_medium=text";
    const result = stripTrackingParams(url);
    expect(result).toBe("https://open.spotify.com/track/abc123");
  });

  it("should strip Spotify si parameter", () => {
    const url = "https://open.spotify.com/track/abc123?si=abcdef123456";
    const result = stripTrackingParams(url);
    expect(result).toBe("https://open.spotify.com/track/abc123");
  });

  it("should preserve non-tracking parameters", () => {
    const url = "https://music.apple.com/us/album/name/123?i=456&utm_source=share";
    const result = stripTrackingParams(url);
    expect(result).toContain("i=456");
    expect(result).not.toContain("utm_source");
  });

  it("should return original string for invalid URL", () => {
    expect(stripTrackingParams("not a url")).toBe("not a url");
  });
});

// =============================================================================
// isUrl
// =============================================================================

describe("isUrl", () => {
  it("should detect https URL", () => {
    expect(isUrl("https://open.spotify.com/track/abc")).toBe(true);
  });

  it("should detect http URL", () => {
    expect(isUrl("http://example.com")).toBe(true);
  });

  it("should detect domain-like string without protocol", () => {
    expect(isUrl("open.spotify.com")).toBe(true);
  });

  it("should reject plain text", () => {
    expect(isUrl("Bohemian Rhapsody")).toBe(false);
  });

  it("should reject empty string", () => {
    expect(isUrl("")).toBe(false);
  });
});

// =============================================================================
// isAlbumUrl
// =============================================================================

describe("isAlbumUrl", () => {
  it("should detect Spotify album URL", () => {
    expect(isAlbumUrl("https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE")).toBe(true);
  });

  it("should detect Spotify intl album URL", () => {
    expect(isAlbumUrl("https://open.spotify.com/intl-de/album/6dVIqQ8qmQ5GBnJ9shOYGE")).toBe(true);
  });

  it("should detect Deezer album URL", () => {
    expect(isAlbumUrl("https://www.deezer.com/album/302127")).toBe(true);
  });

  it("should detect Tidal album URL", () => {
    expect(isAlbumUrl("https://tidal.com/browse/album/95477688")).toBe(true);
  });

  it("should detect Bandcamp album URL", () => {
    expect(isAlbumUrl("https://radiohead.bandcamp.com/album/ok-computer")).toBe(true);
  });

  it("should detect YouTube Music album playlist", () => {
    expect(isAlbumUrl("https://music.youtube.com/playlist?list=OLAK5uy_abc123")).toBe(true);
  });

  it("should NOT detect Spotify track URL as album", () => {
    expect(isAlbumUrl("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")).toBe(false);
  });

  it("should NOT detect plain text as album", () => {
    expect(isAlbumUrl("Bohemian Rhapsody Queen")).toBe(false);
  });

  it("should NOT detect regular YouTube playlist as album", () => {
    expect(isAlbumUrl("https://youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf")).toBe(false);
  });
});
