import type { ApiLink, ResolveSuccessResponse, SharePageResponse } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { parseResolveResponse } from "@/lib/resolve/parsers";
import { buildShareViewFromSharePageResponse } from "@/lib/share/share-view";
import { apiLinksToPlatformLinks } from "./api-links";

describe("apiLinksToPlatformLinks", () => {
  it("normalizes known service labels from shared platform config", () => {
    expect(
      apiLinksToPlatformLinks([
        apiLink("apple-music", "apple-music", "https://music.apple.com/us/album/1"),
        apiLink("youtube-music", "youtube-music", "https://music.youtube.com/watch?v=abc"),
      ]),
    ).toMatchObject([
      { platform: "apple-music", displayName: "Apple Music" },
      { platform: "youtube-music", displayName: "YouTube Music" },
    ]);
  });

  it("drops invalid service ids and missing URLs", () => {
    expect(
      apiLinksToPlatformLinks([
        apiLink("appleMusic", "Apple Music", "https://music.apple.com/us/album/1"),
        apiLink("spotify", "Spotify", ""),
      ]),
    ).toEqual([]);
  });

  it("normalizes resolve parser platform labels", () => {
    const parsed = parseResolveResponse({
      id: "tr_test",
      shortUrl: "https://musiccloud.io/aBc123x",
      track: {
        title: "Take on Me",
        artists: ["a-ha"],
        vinylLayout: null,
      },
      links: [apiLink("apple-music", "apple-music", "https://music.apple.com/us/album/1")],
    } satisfies ResolveSuccessResponse);

    expect(parsed.platforms).toMatchObject([{ platform: "apple-music", displayName: "Apple Music" }]);
  });

  it("normalizes share view platform labels", () => {
    const view = buildShareViewFromSharePageResponse(
      {
        type: "track",
        og: {
          title: "a-ha - Take on Me",
          description: "Listen on musiccloud",
          url: "https://musiccloud.io/aBc123x",
        },
        track: {
          title: "Take on Me",
          artists: ["a-ha"],
          vinylLayout: null,
        },
        links: [apiLink("youtube-music", "youtube-music", "https://music.youtube.com/watch?v=abc")],
        shortUrl: "https://musiccloud.io/aBc123x",
      } satisfies SharePageResponse,
      "aBc123x",
      (key) => key,
    );

    expect(view.config.platforms).toMatchObject([{ platform: "youtube-music", displayName: "YouTube Music" }]);
  });
});

function apiLink(service: string, displayName: string, url: string): ApiLink {
  return {
    service,
    displayName,
    url,
    confidence: 1,
    matchMethod: "cache",
  };
}
