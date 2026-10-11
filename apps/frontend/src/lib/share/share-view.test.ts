import { describe, expect, it } from "vitest";
import { buildShareViewFromSharePageResponse } from "@/lib/share/share-view";

type SharePagePayload = Parameters<typeof buildShareViewFromSharePageResponse>[0];

/**
 * `MediaCardHead` hands the player a share code to refresh from exactly when
 * the config says `previewRefreshable`. An album share whose stored preview
 * has expired arrives without `previewUrl`, so without the flag its player
 * would have nothing to play and nothing to refresh from.
 */
describe("share view preview refresh", () => {
  it("passes an album share's refresh flag to the player", () => {
    const view = buildShareViewFromSharePageResponse(
      {
        type: "album",
        og: { title: "", description: "", image: "", url: "https://musiccloud.local/album" },
        shortUrl: "https://musiccloud.local/album",
        links: [],
        album: { title: "Hunting High and Low", artists: ["a-ha"], previewRefreshable: true, vinylLayout: null },
      } as SharePagePayload,
      "album",
    );

    expect(view.config.previewUrl).toBeUndefined();
    expect(view.config.previewRefreshable).toBe(true);
    expect(view.config.shortId).toBe("album");
  });

  it("passes a track share's refresh flag to the player", () => {
    const view = buildShareViewFromSharePageResponse(
      {
        type: "track",
        og: { title: "", description: "", image: "", url: "https://musiccloud.local/track" },
        shortUrl: "https://musiccloud.local/track",
        links: [],
        track: { title: "Take on Me", artists: ["a-ha"], previewRefreshable: true, vinylLayout: null },
      } as SharePagePayload,
      "track",
    );

    expect(view.config.previewRefreshable).toBe(true);
  });
});
