import { describe, expect, it } from "vitest";
import { isAppleArtworkUrl, isYouTubeArtworkUrl, pickArtworkUrl, pickRecordingArtworkUrl } from "./artwork.js";

const APPLE_COVER = "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/aa/bb/cc/source/640x640bb.jpg";
const SPOTIFY_COVER = "https://i.scdn.co/image/ab67616d0000b273";
const DEEZER_COVER = "https://e-cdns-images.dzcdn.net/images/cover/abc/1000x1000-000000-80-0-0.jpg";

describe("isAppleArtworkUrl", () => {
  it("recognizes Apple's artwork host and its subdomains", () => {
    expect(isAppleArtworkUrl(APPLE_COVER)).toBe(true);
    expect(isAppleArtworkUrl("https://mzstatic.com/image.jpg")).toBe(true);
  });

  it("does not take another host for Apple's, even one that only contains the name", () => {
    expect(isAppleArtworkUrl(SPOTIFY_COVER)).toBe(false);
    expect(isAppleArtworkUrl("https://notmzstatic.com/image.jpg")).toBe(false);
    expect(isAppleArtworkUrl("https://example.com/mzstatic.com/image.jpg")).toBe(false);
    expect(isAppleArtworkUrl("not a url")).toBe(false);
  });
});

describe("recording artwork policy", () => {
  const video = "https://i.ytimg.com/vi/ImX2w6Ufj4w/maxresdefault.jpg";

  it.each([
    video,
    "//i.ytimg.com/vi/id/image.jpg",
    "https://i.ytimg.com./vi/id/image.jpg",
  ])("rejects a stored YouTube cover: %s", (url) => {
    expect(isYouTubeArtworkUrl(url)).toBe(true);
    expect(pickRecordingArtworkUrl(url)).toBeUndefined();
  });

  it("prefers a validated catalogue cover to video artwork", () => {
    expect(pickRecordingArtworkUrl(video, [{ service: "deezer", artworkUrl: DEEZER_COVER }])).toBe(DEEZER_COVER);
  });

  it.each([
    "youtube",
    "youtube-music",
    "apple-music",
  ])("rejects a known %s source cover even on another CDN", (service) => {
    expect(pickRecordingArtworkUrl("https://example.com/frame.jpg", [], service)).toBeUndefined();
  });

  it("rejects YouTube candidates even on an unrelated image host", () => {
    expect(
      pickRecordingArtworkUrl(undefined, [{ service: "youtube", artworkUrl: "https://example.com/frame.jpg" }]),
    ).toBeUndefined();
  });

  it("keeps existing good covers and retains the Apple exclusion", () => {
    expect(pickRecordingArtworkUrl(DEEZER_COVER, [{ service: "spotify", artworkUrl: SPOTIFY_COVER }])).toBe(
      DEEZER_COVER,
    );
    expect(pickRecordingArtworkUrl(APPLE_COVER)).toBeUndefined();
  });

  it("does not change the separate channel-portrait policy", () => {
    const portrait = "https://yt3.ggpht.com/portrait";
    expect(pickRecordingArtworkUrl(portrait)).toBeUndefined();
    expect(pickArtworkUrl(portrait, [])).toBe(portrait);
  });

  it("does not classify a lookalike host as YouTube", () => {
    expect(isYouTubeArtworkUrl("https://notytimg.com/cover.jpg")).toBe(false);
  });
});

describe("pickArtworkUrl", () => {
  it("keeps the entity's own cover when it is not Apple's", () => {
    expect(pickArtworkUrl(DEEZER_COVER, [{ service: "spotify", artworkUrl: SPOTIFY_COVER }])).toBe(DEEZER_COVER);
  });

  it("replaces Apple's cover with Spotify's before any other service's", () => {
    const borrowed = [
      { service: "deezer", artworkUrl: DEEZER_COVER },
      { service: "spotify", artworkUrl: SPOTIFY_COVER },
    ];
    expect(pickArtworkUrl(APPLE_COVER, borrowed)).toBe(SPOTIFY_COVER);
  });

  it("borrows the first other cover when Spotify has none", () => {
    const borrowed = [
      { service: "spotify" },
      { service: "apple-music", artworkUrl: APPLE_COVER },
      { service: "deezer", artworkUrl: DEEZER_COVER },
    ];
    expect(pickArtworkUrl(undefined, borrowed)).toBe(DEEZER_COVER);
  });

  it("keeps no cover when only Apple has one", () => {
    expect(pickArtworkUrl(APPLE_COVER, [{ service: "apple-music", artworkUrl: APPLE_COVER }])).toBeUndefined();
  });
});
