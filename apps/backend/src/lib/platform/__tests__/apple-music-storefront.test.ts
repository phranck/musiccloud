import { afterEach, describe, expect, it } from "vitest";
import {
  extractAppleMusicStorefront,
  resolveAppleMusicStorefrontFromHeaders,
  rewriteAppleMusicUrlForStorefront,
} from "../apple-music-storefront.js";

const originalStorefront = process.env.APPLE_MUSIC_STOREFRONT;

afterEach(() => {
  if (originalStorefront === undefined) {
    delete process.env.APPLE_MUSIC_STOREFRONT;
  } else {
    process.env.APPLE_MUSIC_STOREFRONT = originalStorefront;
  }
});

describe("Apple Music storefront helpers", () => {
  it("extracts the storefront from Apple Music URLs", () => {
    expect(extractAppleMusicStorefront("https://music.apple.com/us/album/example/123?i=456")).toBe("us");
    expect(extractAppleMusicStorefront("https://music.apple.com/AT/song/example/456")).toBe("at");
    expect(extractAppleMusicStorefront("https://open.spotify.com/track/123")).toBeNull();
  });

  it("rewrites the storefront segment to the viewer storefront, keeping the catalogue id", () => {
    const url = "https://music.apple.com/us/album/mercy-mercy-mercy/1443463488?i=1443463670";

    expect(rewriteAppleMusicUrlForStorefront(url, "at")).toBe(
      "https://music.apple.com/at/album/mercy-mercy-mercy/1443463488?i=1443463670",
    );
  });

  it("returns the URL unchanged when the storefront already matches", () => {
    const url = "https://music.apple.com/us/album/mercy-mercy-mercy/1443463488?i=1443463670";

    expect(rewriteAppleMusicUrlForStorefront(url, "us")).toBe(url);
  });

  it("returns the URL unchanged when no request storefront can be inferred", () => {
    const url = "https://music.apple.com/us/album/mercy-mercy-mercy/1443463488?i=1443463670";

    expect(rewriteAppleMusicUrlForStorefront(url, null)).toBe(url);
  });

  it("returns non-Apple URLs unchanged", () => {
    expect(rewriteAppleMusicUrlForStorefront("https://example.com/not-apple", "at")).toBe(
      "https://example.com/not-apple",
    );
  });

  it("prefers explicit proxy country headers over Accept-Language and env fallback", () => {
    process.env.APPLE_MUSIC_STOREFRONT = "us";

    expect(
      resolveAppleMusicStorefrontFromHeaders({
        "cf-ipcountry": "AT",
        "accept-language": "en-US,en;q=0.9",
      }),
    ).toBe("at");
  });

  it("uses regional Accept-Language tags when proxy country headers are absent", () => {
    delete process.env.APPLE_MUSIC_STOREFRONT;

    expect(resolveAppleMusicStorefrontFromHeaders({ "accept-language": "de-AT,de;q=0.9,en;q=0.8" })).toBe("at");
  });
});
