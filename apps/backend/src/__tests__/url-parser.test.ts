import { describe, expect, it } from "vitest";
import { isUrl, stripTrackingParams, validateMusicUrl } from "@/lib/platform/url";

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

    it("should accept mobile YouTube watch URL with extra params and fragment", () => {
      expect(validateMusicUrl("https://m.youtube.com/watch?v=fLbsQrJI63s&pp=0gcJCUECo7VqN5tD&ra=m#searching")).toEqual({
        valid: true,
      });
    });

    it("should accept plain text as valid (triggers text search)", () => {
      expect(validateMusicUrl("Bohemian Rhapsody Queen")).toEqual({ valid: true });
    });

    it("should accept dotted song titles as plain text", () => {
      expect(validateMusicUrl("I.G.Y.")).toEqual({ valid: true });
      expect(validateMusicUrl("P.Y.T.")).toEqual({ valid: true });
    });

    it("should accept Apple Music album URL with ?i= track param", () => {
      expect(validateMusicUrl("https://music.apple.com/us/album/name/123?i=456")).toEqual({ valid: true });
    });

    it("should accept SoundCloud short URL (on.soundcloud.com)", () => {
      expect(validateMusicUrl("https://on.soundcloud.com/BOT0GlrIxJ3iGawWmK")).toEqual({ valid: true });
    });

    it("should accept MusicBrainz recording URL for adapter-based resolution", () => {
      expect(validateMusicUrl("https://musicbrainz.org/recording/69c62fec-0694-4279-b73e-0d83ae3ae09c")).toEqual({
        valid: true,
      });
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

    it("should say that a YouTube Music album cannot be resolved yet", () => {
      // A YouTube Music album is a playlist whose id starts with OLAK5uy_, and
      // no plugin resolves it, so the answer names that instead of calling it
      // "not a music link".
      for (const url of [
        "https://music.youtube.com/playlist?list=OLAK5uy_abc123",
        "https://www.youtube.com/playlist?list=OLAK5uy_abc123",
        "https://music.youtube.com/playlist?feature=share&list=OLAK5uy_abc123",
      ]) {
        const result = validateMusicUrl(url);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.code).toBe("PLAYLIST_NOT_SUPPORTED");
          expect(result.message).toContain("YouTube Music albums");
        }
      }
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

    it("should point a Jamendo link at the Creative Commons endpoint", () => {
      const result = validateMusicUrl("https://jamendo.com/track/459544");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe("UNSUPPORTED_SERVICE");
        expect(result.message).toContain("/api/v1/cc/resolve");
      }
    });

    it("should reject malformed explicit URLs", () => {
      const result = validateMusicUrl("https://bad url");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe("INVALID_URL");
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

  it("should normalize a mobile YouTube watch URL to the canonical www form", () => {
    const url = "https://m.youtube.com/watch?v=fLbsQrJI63s&pp=0gcJCUECo7VqN5tD&ra=m#searching";
    expect(stripTrackingParams(url)).toBe("https://www.youtube.com/watch?v=fLbsQrJI63s");
  });

  it("should normalize a mobile YouTube artist URL host to the canonical www form", () => {
    // Non-/watch mobile paths are host-normalized too, so `classifyMusicUrl`
    // sees the www form, which the YouTube artist detector claims.
    expect(stripTrackingParams("https://m.youtube.com/@kreatorofficial")).toBe(
      "https://www.youtube.com/@kreatorofficial",
    );
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

  it("should detect known music service hosts without protocol", () => {
    expect(isUrl("open.spotify.com")).toBe(true);
  });

  it("should detect known music short links without protocol", () => {
    expect(isUrl("link.deezer.com/s/abc123")).toBe(true);
    expect(isUrl("on.soundcloud.com/abc123")).toBe(true);
  });

  it("should detect known music marketplace subdomains without protocol", () => {
    expect(isUrl("artist.bandcamp.com/track/song-title")).toBe(true);
  });

  it("should reject unsupported domains without protocol", () => {
    expect(isUrl("example.com/foo")).toBe(false);
  });

  it("should detect explicit unsupported URLs", () => {
    expect(isUrl("https://example.com/foo")).toBe(true);
  });

  it("should reject dotted song titles", () => {
    expect(isUrl("I.G.Y.")).toBe(false);
    expect(isUrl("A.B.")).toBe(false);
    expect(isUrl("P.Y.T.")).toBe(false);
  });

  it("should reject plain text", () => {
    expect(isUrl("Bohemian Rhapsody")).toBe(false);
  });

  it("should reject empty string", () => {
    expect(isUrl("")).toBe(false);
  });
});
