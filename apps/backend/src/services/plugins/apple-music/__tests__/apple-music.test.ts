import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/infra/fetch.js", () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchWithTimeout } from "../../../../lib/infra/fetch.js";
import { appleMusicAdapter } from "../adapter.js";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

// Provide a static token so the adapter skips JWT signing in tests.
process.env.APPLE_MUSIC_TOKEN = "test-token";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Apple Music adapter — searchTrack", () => {
  it("includes album in the term when query.album is provided", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(jsonResponse({ results: { songs: { data: [] } } }));

    await appleMusicAdapter.searchTrack({
      title: "Karma Police",
      artist: "Radiohead",
      album: "OK Computer",
    });

    const calledUrl = vi.mocked(fetchWithTimeout).mock.calls[0][0] as string;
    expect(calledUrl).toContain("Radiohead");
    expect(calledUrl).toContain("Karma");
    expect(calledUrl).toContain("OK%20Computer");
  });

  it("omits album from term when query.album is not set", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(jsonResponse({ results: { songs: { data: [] } } }));

    await appleMusicAdapter.searchTrack({ title: "Karma Police", artist: "Radiohead" });

    const calledUrl = vi.mocked(fetchWithTimeout).mock.calls[0][0] as string;
    expect(calledUrl).toContain("Radiohead");
    expect(calledUrl).toContain("Karma");
    expect(calledUrl).not.toContain("OK%20Computer");
  });
});

describe("Apple Music adapter previews", () => {
  it("leaves out the preview Apple sends with a song", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "1440806725",
            type: "songs",
            attributes: {
              name: "Karma Police",
              artistName: "Radiohead",
              url: "https://music.apple.com/us/song/karma-police/1440806725",
              previews: [{ url: "https://audio-ssl.itunes.apple.com/preview.m4a" }],
            },
          },
        ],
      }),
    );

    const track = await appleMusicAdapter.getTrack("us:1440806725");

    expect(track.title).toBe("Karma Police");
    expect(track.previewUrl).toBeUndefined();
    expect(appleMusicAdapter.capabilities.supportsPreview).toBe(false);
  });
});

describe("Apple Music adapter artwork", () => {
  const APPLE_ARTWORK = {
    url: "https://is1-ssl.mzstatic.com/image/thumb/Music/{w}x{h}bb.jpg",
    width: 3000,
    height: 3000,
  };

  it("leaves out the artwork Apple sends with a song, an album and an artist", async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "1440806725",
              type: "songs",
              attributes: {
                name: "Karma Police",
                artistName: "Radiohead",
                url: "https://music.apple.com/us/song/karma-police/1440806725",
                artwork: APPLE_ARTWORK,
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "1097861387",
              type: "albums",
              attributes: {
                name: "OK Computer",
                artistName: "Radiohead",
                url: "https://music.apple.com/us/album/ok-computer/1097861387",
                artwork: APPLE_ARTWORK,
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "657515",
              type: "artists",
              attributes: {
                name: "Radiohead",
                url: "https://music.apple.com/us/artist/radiohead/657515",
                artwork: APPLE_ARTWORK,
              },
            },
          ],
        }),
      );

    const track = await appleMusicAdapter.getTrack("us:1440806725");
    const album = await appleMusicAdapter.getAlbum?.("us:1097861387");
    const artist = await appleMusicAdapter.getArtist?.("us:657515");

    expect(track.artworkUrl).toBeUndefined();
    expect(album?.title).toBe("OK Computer");
    expect(album?.artworkUrl).toBeUndefined();
    expect(artist?.name).toBe("Radiohead");
    expect(artist?.imageUrl).toBeUndefined();
    expect(appleMusicAdapter.capabilities.supportsArtwork).toBe(false);
  });
});
