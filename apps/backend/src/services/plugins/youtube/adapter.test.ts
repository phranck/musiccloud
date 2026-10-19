import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
vi.mock("../../../lib/infra/fetch", () => ({
  fetchWithTimeout: (...args: unknown[]) => request(...args),
}));

import { youtubeAdapter } from "./adapter.js";

beforeEach(() => {
  request.mockReset();
  vi.stubEnv("YOUTUBE_API_KEY", "unit-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("YouTube recording and portrait boundaries", () => {
  it("never labels a video thumbnail as a recording cover", async () => {
    request.mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "ImX2w6Ufj4w",
              snippet: {
                title: "DARKK - Hurt People",
                channelTitle: "DARKK",
                description: "",
                publishedAt: "2026-10-16",
                thumbnails: { maxres: { url: "https://i.ytimg.com/vi/ImX2w6Ufj4w/maxresdefault.jpg" } },
              },
              contentDetails: { duration: "PT3M20S" },
            },
          ],
        }),
      ),
    );
    const track = await youtubeAdapter.getTrack("ImX2w6Ufj4w");
    expect(track.artworkUrl).toBeUndefined();
    expect(track.durationMs).toBe(200000);
    expect(youtubeAdapter.capabilities.supportsArtwork).toBe(false);
  });

  it("retains the separate channel-portrait policy", async () => {
    const portrait = "https://yt3.ggpht.com/channel-portrait";
    request.mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "channel-id",
              snippet: {
                title: "DARKK",
                description: "",
                customUrl: "@darkk",
                thumbnails: { high: { url: portrait } },
              },
            },
          ],
        }),
      ),
    );
    const artist = await youtubeAdapter.getArtist!("channel-id");
    expect(artist.imageUrl).toBe(portrait);
  });

  it("reads a video id independently of query-parameter order", () => {
    expect(youtubeAdapter.detectUrl("https://www.youtube.com/watch?si=tracking&v=ImX2w6Ufj4w")).toBe("ImX2w6Ufj4w");
  });

  it.each([
    "https://example.com/youtube.com/watch?v=ImX2w6Ufj4w",
    "https://www.youtube.com/search?v=ImX2w6Ufj4w",
    "https://www.youtube.com/watch?v=short",
  ])("does not turn a non-recording URL into a video id: %s", (url) => {
    expect(youtubeAdapter.detectUrl(url)).toBeNull();
  });
});
