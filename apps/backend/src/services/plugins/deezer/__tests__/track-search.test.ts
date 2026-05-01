import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithTimeoutMock = vi.fn();
vi.mock("../../../../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (url: string, init?: RequestInit, timeoutMs?: number) => fetchWithTimeoutMock(url, init, timeoutMs),
}));

import { isPlausibleMatch, searchDeezerTrackForArtist } from "../track-search";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

const HIT_ALICIA = {
  data: [
    {
      id: 629466,
      title: "If I Ain't Got You",
      duration: 228,
      link: "https://www.deezer.com/track/629466",
      album: { title: "The Diary Of Alicia Keys", cover_medium: "https://cdn/cover.jpg" },
      artist: { name: "Alicia Keys" },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isPlausibleMatch", () => {
  it("accepts exact title + exact artist", () => {
    expect(isPlausibleMatch("Twilight", "Haku-San", "Twilight", "Haku-San")).toBe(true);
  });

  it("accepts candidate-artist substring of wanted (Alicia Keys vs. Alicia Keys & Maxwell)", () => {
    expect(isPlausibleMatch("If I Ain't Got You", "Alicia Keys", "If I Ain't Got You", "Alicia Keys & Maxwell")).toBe(
      true,
    );
  });

  it("accepts wanted-title substring of candidate (Twilight vs. Twilight (Original Mix))", () => {
    expect(isPlausibleMatch("Twilight (Original Mix)", "Haku-San", "Twilight", "Haku-San")).toBe(true);
  });

  it("rejects mismatched artist (Mareel vs. Michael Jackson)", () => {
    expect(isPlausibleMatch("Thriller", "Michael Jackson", "Thriller", "Mareel")).toBe(false);
  });

  it("rejects mismatched title with no substring overlap", () => {
    expect(isPlausibleMatch("Sunrise", "Haku-San", "Twilight", "Haku-San")).toBe(false);
  });

  it("is case-insensitive and trims", () => {
    expect(isPlausibleMatch("  TWILIGHT  ", "haku-san", "twilight", "Haku-San")).toBe(true);
  });
});

describe("searchDeezerTrackForArtist", () => {
  it("returns enrichment for a plausible Deezer hit", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse(HIT_ALICIA));

    const result = await searchDeezerTrackForArtist("If I Ain't Got You", "Alicia Keys & Maxwell");

    expect(result).toEqual({
      artworkUrl: "https://cdn/cover.jpg",
      albumName: "The Diary Of Alicia Keys",
      durationMs: 228000,
      deezerUrl: "https://www.deezer.com/track/629466",
    });
    expect(fetchWithTimeoutMock).toHaveBeenCalledOnce();
    const calledUrl = fetchWithTimeoutMock.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/^https:\/\/api\.deezer\.com\/search\/track\?q=/);
    expect(calledUrl).toMatch(/&limit=3$/);
  });

  it("skips implausible candidates and tries the next one", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 1,
            title: "Thriller",
            duration: 358,
            link: "https://www.deezer.com/track/1",
            album: { title: "Thriller", cover_medium: "https://cdn/wrong.jpg" },
            artist: { name: "Michael Jackson" }, // implausible — wanted artist is Mareel
          },
          {
            id: 2,
            title: "Echo",
            duration: 240,
            link: "https://www.deezer.com/track/2",
            album: { title: "Echo", cover_medium: "https://cdn/right.jpg" },
            artist: { name: "Mareel" }, // plausible
          },
        ],
      }),
    );

    const result = await searchDeezerTrackForArtist("Echo", "Mareel");
    expect(result?.artworkUrl).toBe("https://cdn/right.jpg");
  });

  it("returns null when no candidate is plausible", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 1,
            title: "Thriller",
            duration: 358,
            link: "https://www.deezer.com/track/1",
            album: { title: "Thriller", cover_medium: "https://cdn/wrong.jpg" },
            artist: { name: "Michael Jackson" },
          },
        ],
      }),
    );

    const result = await searchDeezerTrackForArtist("Echo", "Mareel");
    expect(result).toBeNull();
  });

  it("returns null on empty Deezer response", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse({ data: [] }));
    const result = await searchDeezerTrackForArtist("Anything", "Indie Artist");
    expect(result).toBeNull();
  });

  it("returns null on HTTP error", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse({}, 500));
    const result = await searchDeezerTrackForArtist("Anything", "Indie Artist");
    expect(result).toBeNull();
  });

  it("returns null on fetch throw (timeout/network)", async () => {
    fetchWithTimeoutMock.mockRejectedValue(new Error("timeout"));
    const result = await searchDeezerTrackForArtist("Anything", "Indie Artist");
    expect(result).toBeNull();
  });

  it("uses a 5s timeout and the search-track endpoint", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse(HIT_ALICIA));
    await searchDeezerTrackForArtist("If I Ain't Got You", "Alicia Keys");
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(expect.any(String), {}, 5000);
  });

  it("falls back to cover_big when cover_medium is missing", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 9,
            title: "X",
            duration: 100,
            link: "https://www.deezer.com/track/9",
            album: { title: "Y", cover_big: "https://cdn/big.jpg" },
            artist: { name: "Z" },
          },
        ],
      }),
    );
    const result = await searchDeezerTrackForArtist("X", "Z");
    expect(result?.artworkUrl).toBe("https://cdn/big.jpg");
  });

  it("returns null artwork when both cover sizes are missing (still enriches album/duration)", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 9,
            title: "X",
            duration: 100,
            link: "https://www.deezer.com/track/9",
            album: { title: "Y" },
            artist: { name: "Z" },
          },
        ],
      }),
    );
    const result = await searchDeezerTrackForArtist("X", "Z");
    expect(result).toEqual({
      artworkUrl: null,
      albumName: "Y",
      durationMs: 100000,
      deezerUrl: "https://www.deezer.com/track/9",
    });
  });
});
