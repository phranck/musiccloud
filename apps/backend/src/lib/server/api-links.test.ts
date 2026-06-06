import { describe, expect, it } from "vitest";
import { type PublicLinkSource, toApiLinks, toCachedApiLinks } from "./api-links.js";

describe("api link builders", () => {
  it("hydrates canonical labels for known services", () => {
    const links = toApiLinks([
      freshLink("apple-music", "https://music.apple.com/us/album/take-on-me/1433036073?i=1433036081"),
      freshLink("youtube-music", "https://music.youtube.com/watch?v=djV11Xbc914"),
      freshLink("netease", "https://music.163.com/song?id=123"),
    ]);

    expect(links).toMatchObject([
      { service: "apple-music", displayName: "Apple Music" },
      { service: "youtube-music", displayName: "YouTube Music" },
      { service: "netease", displayName: "NetEase Cloud Music" },
    ]);
  });

  it("drops invalid service ids", () => {
    expect(toApiLinks([freshLink("appleMusic", "https://music.apple.com/us/album/1")])).toEqual([]);
    expect(toCachedApiLinks([{ service: "unknown-service", url: "https://example.com" }])).toEqual([]);
  });

  it("preserves valid fresh resolve confidence and match method", () => {
    expect(
      toApiLinks([
        {
          service: "spotify",
          url: "https://open.spotify.com/track/abc",
          confidence: 0.87,
          matchMethod: "search",
        },
      ]),
    ).toEqual([
      {
        service: "spotify",
        displayName: "Spotify",
        url: "https://open.spotify.com/track/abc",
        confidence: 0.87,
        matchMethod: "search",
      },
    ]);
  });

  it("drops fresh links with invalid public match metadata", () => {
    expect(
      toApiLinks([
        { service: "spotify", url: "https://open.spotify.com/track/abc", confidence: null, matchMethod: "isrc" },
        { service: "deezer", url: "https://www.deezer.com/track/123", confidence: 1, matchMethod: "legacy" },
      ]),
    ).toEqual([]);
  });

  it('forces cached links to confidence 1 and matchMethod "cache"', () => {
    expect(
      toCachedApiLinks([
        {
          service: "spotify",
          url: "https://open.spotify.com/track/abc",
          confidence: 0.42,
          matchMethod: "search",
        },
      ]),
    ).toEqual([
      {
        service: "spotify",
        displayName: "Spotify",
        url: "https://open.spotify.com/track/abc",
        confidence: 1,
        matchMethod: "cache",
      },
    ]);
  });

  it("strips tracking parameters without removing Apple Music semantic item ids", () => {
    const [link] = toApiLinks(
      [freshLink("apple-music", "https://music.apple.com/us/album/take-on-me/1433036073?i=1433036081&utm_source=test")],
      { stripTracking: true },
    );

    expect(link.url).toBe("https://music.apple.com/us/album/take-on-me/1433036073?i=1433036081");
  });
});

function freshLink(service: string, url: string): PublicLinkSource {
  return {
    service,
    url,
    confidence: 1,
    matchMethod: "isrc",
  };
}
