import { describe, expect, it } from "vitest";
import { appleMusicAdapter } from "../services/adapters/apple-music";
import { audiusAdapter } from "../services/adapters/audius";
import { napsterAdapter } from "../services/adapters/napster";
import { pandoraAdapter } from "../services/adapters/pandora";
import { soundcloudAdapter } from "../services/adapters/soundcloud";
import { spotifyAdapter } from "../services/adapters/spotify";
import { youtubeAdapter } from "../services/adapters/youtube";

// =============================================================================
// Spotify adapter: detectUrl
// =============================================================================

describe("Spotify: detectUrl", () => {
  it("should extract track ID from standard URL", () => {
    expect(spotifyAdapter.detectUrl("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")).toBe(
      "4uLU6hMCjMI75M1A2tKUQC",
    );
  });

  it("should extract track ID from international URL", () => {
    expect(spotifyAdapter.detectUrl("https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC")).toBe(
      "4uLU6hMCjMI75M1A2tKUQC",
    );
  });

  it("should extract track ID from URL with query params", () => {
    expect(spotifyAdapter.detectUrl("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123")).toBe(
      "4uLU6hMCjMI75M1A2tKUQC",
    );
  });

  it("should extract track ID from Spotify URI", () => {
    expect(spotifyAdapter.detectUrl("spotify:track:4uLU6hMCjMI75M1A2tKUQC")).toBe("4uLU6hMCjMI75M1A2tKUQC");
  });

  it("should return null for playlist URL", () => {
    expect(spotifyAdapter.detectUrl("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")).toBeNull();
  });

  it("should return null for album URL", () => {
    expect(spotifyAdapter.detectUrl("https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx")).toBeNull();
  });

  it("should return null for podcast episode URL", () => {
    expect(spotifyAdapter.detectUrl("https://open.spotify.com/episode/abc123")).toBeNull();
  });

  it("should return null for non-Spotify URL", () => {
    expect(spotifyAdapter.detectUrl("https://music.apple.com/us/album/bohemian/123")).toBeNull();
  });
});

// =============================================================================
// Apple Music adapter: detectUrl
// =============================================================================

describe("Apple Music: detectUrl", () => {
  it("should extract track ID from album URL with ?i= param", () => {
    expect(
      appleMusicAdapter.detectUrl("https://music.apple.com/us/album/bohemian-rhapsody/1440806041?i=1440806768"),
    ).toBe("us:1440806768");
  });

  it("should extract track ID from direct song URL", () => {
    expect(appleMusicAdapter.detectUrl("https://music.apple.com/us/song/bohemian-rhapsody/1440806768")).toBe(
      "us:1440806768",
    );
  });

  it("should preserve regional storefront (German store)", () => {
    expect(
      appleMusicAdapter.detectUrl("https://music.apple.com/de/album/bohemian-rhapsody/1440806041?i=1440806768"),
    ).toBe("de:1440806768");
  });

  it("should return null for album-only URL (no ?i= param)", () => {
    expect(appleMusicAdapter.detectUrl("https://music.apple.com/us/album/a-night-at-the-opera/1440806041")).toBeNull();
  });

  it("should return null for non-Apple Music URL", () => {
    expect(appleMusicAdapter.detectUrl("https://open.spotify.com/track/abc123")).toBeNull();
  });
});

// =============================================================================
// YouTube adapter: detectUrl
// =============================================================================

describe("YouTube: detectUrl", () => {
  it("should extract video ID from standard URL", () => {
    expect(youtubeAdapter.detectUrl("https://www.youtube.com/watch?v=fJ9rUzIMcZQ")).toBe("fJ9rUzIMcZQ");
  });

  it("should extract video ID from short URL", () => {
    expect(youtubeAdapter.detectUrl("https://youtu.be/fJ9rUzIMcZQ")).toBe("fJ9rUzIMcZQ");
  });

  it("should extract video ID from YouTube Music URL", () => {
    expect(youtubeAdapter.detectUrl("https://music.youtube.com/watch?v=fJ9rUzIMcZQ")).toBe("fJ9rUzIMcZQ");
  });

  it("should return null for playlist URL", () => {
    expect(youtubeAdapter.detectUrl("https://www.youtube.com/playlist?list=PLrAXtmErZgOe123")).toBeNull();
  });

  it("should return null for channel URL", () => {
    expect(youtubeAdapter.detectUrl("https://www.youtube.com/channel/UCxxxxxxx")).toBeNull();
  });

  it("should return null for non-YouTube URL", () => {
    expect(youtubeAdapter.detectUrl("https://open.spotify.com/track/abc123")).toBeNull();
  });
});

// =============================================================================
// Audius adapter: detectUrl
// =============================================================================

describe("Audius: detectUrl (adapter-urls)", () => {
  it("should extract path from standard URL", () => {
    expect(audiusAdapter.detectUrl("https://audius.co/deadmau5/unlucky-work-in-progress-333797")).toBe(
      "deadmau5/unlucky-work-in-progress-333797",
    );
  });

  it("should handle URL with query params", () => {
    expect(audiusAdapter.detectUrl("https://audius.co/artist/track-name?ref=share")).toBe("artist/track-name");
  });

  it("should return null for user profile URL", () => {
    expect(audiusAdapter.detectUrl("https://audius.co/deadmau5")).toBeNull();
  });

  it("should return null for non-Audius URL", () => {
    expect(audiusAdapter.detectUrl("https://open.spotify.com/track/abc123")).toBeNull();
  });
});

// =============================================================================
// Napster adapter: detectUrl
// =============================================================================

describe("Napster: detectUrl (adapter-urls)", () => {
  it("should extract track ID from play.napster.com URL", () => {
    expect(napsterAdapter.detectUrl("https://play.napster.com/track/tra.262370664")).toBe("tra.262370664");
  });

  it("should extract track ID from web.napster.com URL", () => {
    expect(napsterAdapter.detectUrl("https://web.napster.com/track/tra.262370664")).toBe("tra.262370664");
  });

  it("should return null for non-Napster URL", () => {
    expect(napsterAdapter.detectUrl("https://open.spotify.com/track/abc123")).toBeNull();
  });
});

// =============================================================================
// SoundCloud adapter: detectUrl
// =============================================================================

describe("SoundCloud: detectUrl (adapter-urls)", () => {
  it("should extract path from standard URL", () => {
    expect(soundcloudAdapter.detectUrl("https://soundcloud.com/taylorswift/shake-it-off")).toBe(
      "taylorswift/shake-it-off",
    );
  });

  it("should extract path from www URL", () => {
    expect(soundcloudAdapter.detectUrl("https://www.soundcloud.com/taylorswift/shake-it-off")).toBe(
      "taylorswift/shake-it-off",
    );
  });

  it("should extract path from mobile URL", () => {
    expect(soundcloudAdapter.detectUrl("https://m.soundcloud.com/taylorswift/shake-it-off")).toBe(
      "taylorswift/shake-it-off",
    );
  });

  it("should strip query parameters", () => {
    expect(soundcloudAdapter.detectUrl("https://soundcloud.com/taylorswift/shake-it-off?si=abc")).toBe(
      "taylorswift/shake-it-off",
    );
  });

  it("should return null for set/playlist URL", () => {
    expect(soundcloudAdapter.detectUrl("https://soundcloud.com/taylorswift/sets/1989")).toBeNull();
  });

  it("should return null for user profile URL", () => {
    expect(soundcloudAdapter.detectUrl("https://soundcloud.com/taylorswift")).toBeNull();
  });

  it("should return null for non-SoundCloud URL", () => {
    expect(soundcloudAdapter.detectUrl("https://open.spotify.com/track/abc123")).toBeNull();
  });
});

// =============================================================================
// Pandora adapter: detectUrl
// =============================================================================

describe("Pandora: detectUrl (adapter-urls)", () => {
  it("should extract path from standard track URL", () => {
    expect(
      pandoraAdapter.detectUrl(
        "https://www.pandora.com/artist/taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6",
      ),
    ).toBe("taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6");
  });

  it("should extract path from URL without www", () => {
    expect(
      pandoraAdapter.detectUrl(
        "https://pandora.com/artist/taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6",
      ),
    ).toBe("taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6");
  });

  it("should strip query parameters", () => {
    expect(
      pandoraAdapter.detectUrl(
        "https://www.pandora.com/artist/taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6?ref=share",
      ),
    ).toBe("taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6");
  });

  it("should return null for artist-only URL", () => {
    expect(pandoraAdapter.detectUrl("https://www.pandora.com/artist/taylor-swift")).toBeNull();
  });

  it("should return null for non-Pandora URL", () => {
    expect(pandoraAdapter.detectUrl("https://open.spotify.com/track/abc123")).toBeNull();
  });
});
