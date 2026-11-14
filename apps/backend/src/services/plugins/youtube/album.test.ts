import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
vi.mock("../../../lib/infra/fetch", () => ({
  fetchWithTimeout: (...args: unknown[]) => request(...args),
}));

import { youtubeAdapter } from "./adapter.js";

const FADERHEAD_ID = "OLAK5uy_k-hEURafyudUOfdMDqalsXn4G6ci_5yeM";
const ANNA_ID = "OLAK5uy_ld4pFbFCtijadJFM5Bi28xJ1H5E2XL0Bc";

function hexEncodedJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\s\S]/g, (character) => {
    const code = character.charCodeAt(0);
    return code <= 0xff ? `\\x${code.toString(16).padStart(2, "0")}` : character;
  });
}

function hydration(path: "search" | "browse", data: unknown): string {
  const escapedPath = String.raw`\/${path}`;
  return `<script>try {const initialData = [];initialData.push({path: '${escapedPath}', params: JSON.parse('\\x7b\\x7d'), data: '${hexEncodedJson(data)}'});ytcfg.set({'YTMUSIC_INITIAL_DATA': initialData});} catch (e) {}</script>`;
}

function htmlResponse(html: string): Response {
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

function artistRun(name: string) {
  return {
    text: name,
    navigationEndpoint: {
      browseEndpoint: {
        browseEndpointContextSupportedConfigs: {
          browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ARTIST" },
        },
      },
    },
  };
}

function albumCard(title: string, artist: string, year: string, playlistId: string, kind = "Album") {
  return {
    title: { runs: [{ text: title }] },
    subtitle: { runs: [{ text: kind }, { text: " • " }, artistRun(artist), { text: " • " }, { text: year }] },
    buttons: [{ buttonRenderer: { command: { watchPlaylistEndpoint: { playlistId } } } }],
  };
}

function albumRow(title: string, artist: string, year: string, playlistId: string) {
  return {
    flexColumns: [
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title }] } } },
      {
        musicResponsiveListItemFlexColumnRenderer: {
          text: { runs: [{ text: "Album" }, { text: " • " }, artistRun(artist), { text: " • " }, { text: year }] },
        },
      },
    ],
    navigationEndpoint: { browseEndpoint: { browseId: "MPREb_test" } },
    thumbnailOverlay: {
      musicItemThumbnailOverlayRenderer: {
        content: {
          musicPlayButtonRenderer: { playNavigationEndpoint: { watchPlaylistEndpoint: { playlistId } } },
        },
      },
    },
  };
}

function searchDocument(...contents: unknown[]) {
  return {
    contents: {
      tabbedSearchResultsRenderer: {
        tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents } } } }],
      },
    },
  };
}

function albumDocument(title: string, artist: string, year: string, totalTracks: number) {
  return {
    contents: {
      musicResponsiveHeaderRenderer: {
        title: { runs: [{ text: title }] },
        subtitle: { runs: [{ text: "Album" }, { text: " • " }, { text: year }] },
        straplineTextOne: { runs: [artistRun(artist)] },
        secondSubtitle: { runs: [{ text: `${totalTracks} songs` }, { text: " • " }, { text: "49 minutes" }] },
      },
    },
  };
}

function playlistDetails(id: string, title: string, totalTracks: number) {
  return {
    id,
    snippet: {
      title: `Album - ${title}`,
      channelId: "UCBR8-60-B28hp2BmDPdntcQ",
      channelTitle: "YouTube",
      description: "",
      publishedAt: "2026-09-28T17:23:21.787872Z",
    },
    contentDetails: { itemCount: totalTracks },
  };
}

function mockAlbumSearch(searchData: unknown, details: unknown[] = []) {
  request.mockImplementation(async (input: string) => {
    const url = String(input);
    if (url.startsWith("https://music.youtube.com/search?")) return htmlResponse(hydration("search", searchData));
    if (url.startsWith("https://www.googleapis.com/youtube/v3/playlists?")) {
      return Response.json({ kind: "youtube#playlistListResponse", items: details });
    }
    throw new Error("Unexpected provider request");
  });
}

beforeEach(() => {
  request.mockReset();
  vi.stubEnv("YOUTUBE_API_KEY", "unit-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("YouTube album search", () => {
  it("finds Faderhead's album card and validates its official track count", async () => {
    mockAlbumSearch(
      searchDocument({ musicCardShelfRenderer: albumCard("Legacy Code", "Faderhead", "2026", FADERHEAD_ID) }),
      [playlistDetails(FADERHEAD_ID, "Legacy Code", 12)],
    );

    const result = await youtubeAdapter.searchAlbum!({
      title: "Legacy Code",
      artist: "Faderhead",
      year: "2026",
      totalTracks: 12,
    });

    expect(result).toMatchObject({ found: true, confidence: 1, matchMethod: "search" });
    expect(result.album).toMatchObject({
      sourceService: "youtube",
      sourceId: FADERHEAD_ID,
      title: "Legacy Code",
      artists: ["Faderhead"],
      releaseDate: "2026",
      totalTracks: 12,
      webUrl: `https://www.youtube.com/playlist?list=${FADERHEAD_ID}`,
    });
  });

  it("finds Anna Lapwood's album row beneath a different top result", async () => {
    mockAlbumSearch(
      searchDocument(
        { musicCardShelfRenderer: albumCard("Prologue", "Anna Lapwood", "52K views", "video-id", "Video") },
        {
          itemSectionRenderer: {
            contents: [
              {
                musicResponsiveListItemRenderer: albumRow(
                  "Not All Those Who Wander Are Lost",
                  "Anna Lapwood",
                  "2026",
                  ANNA_ID,
                ),
              },
            ],
          },
        },
      ),
      [playlistDetails(ANNA_ID, "Not All Those Who Wander Are Lost", 20)],
    );

    const result = await youtubeAdapter.searchAlbum!({
      title: "Not All Those Who Wander Are Lost",
      artist: "Anna Lapwood",
      year: "2026",
      totalTracks: 20,
    });

    expect(result).toMatchObject({ found: true, confidence: 1, matchMethod: "search" });
    expect(result.album).toMatchObject({
      sourceService: "youtube",
      sourceId: ANNA_ID,
      title: "Not All Those Who Wander Are Lost",
      artists: ["Anna Lapwood"],
      releaseDate: "2026",
      totalTracks: 20,
      webUrl: `https://www.youtube.com/playlist?list=${ANNA_ID}`,
    });
  });

  it("deduplicates repeated album renderers before validating official details", async () => {
    const card = { musicCardShelfRenderer: albumCard("Legacy Code", "Faderhead", "2026", FADERHEAD_ID) };
    mockAlbumSearch(searchDocument(card, card), [playlistDetails(FADERHEAD_ID, "Legacy Code", 12)]);

    const result = await youtubeAdapter.searchAlbum!({
      title: "Legacy Code",
      artist: "Faderhead",
      year: "2026",
      totalTracks: 12,
    });

    expect(result).toMatchObject({ found: true, confidence: 1, matchMethod: "search" });
    expect(result.album).toMatchObject({ sourceId: FADERHEAD_ID, totalTracks: 12 });
  });

  it("returns a clean miss when the valid search contains only ordinary playlists", async () => {
    mockAlbumSearch(
      searchDocument({
        musicCardShelfRenderer: albumCard("Legacy Code", "Faderhead", "2026", "PLQpHaPWy4ISk", "Playlist"),
      }),
    );

    const result = await youtubeAdapter.searchAlbum!({ title: "Legacy Code", artist: "Faderhead" });

    expect(result).toEqual({ found: false, confidence: 0, matchMethod: "search" });
  });

  it("rejects an album playlist whose identity does not match the source album", async () => {
    mockAlbumSearch(
      searchDocument({ musicCardShelfRenderer: albumCard("Another Album", "Another Artist", "2020", FADERHEAD_ID) }),
      [playlistDetails(FADERHEAD_ID, "Another Album", 3)],
    );

    const result = await youtubeAdapter.searchAlbum!({
      title: "Legacy Code",
      artist: "Faderhead",
      year: "2026",
      totalTracks: 12,
    });

    expect(result).toEqual({ found: false, confidence: 0, matchMethod: "search" });
  });

  it("rejects a consent or gateway document instead of returning a clean miss", async () => {
    request.mockResolvedValue(htmlResponse("<html>Before you continue</html>"));

    await expect(youtubeAdapter.searchAlbum!({ title: "Legacy Code", artist: "Faderhead" })).rejects.toThrow(
      /search document/i,
    );
  });

  it("rejects an HTTP failure instead of returning a clean miss", async () => {
    request.mockResolvedValue(Response.json({ error: "unavailable" }, { status: 503 }));

    await expect(youtubeAdapter.searchAlbum!({ title: "Legacy Code", artist: "Faderhead" })).rejects.toThrow();
  });

  it("rejects missing official details for a discovered album", async () => {
    mockAlbumSearch(
      searchDocument({ musicCardShelfRenderer: albumCard("Legacy Code", "Faderhead", "2026", FADERHEAD_ID) }),
    );

    await expect(
      youtubeAdapter.searchAlbum!({ title: "Legacy Code", artist: "Faderhead", year: "2026", totalTracks: 12 }),
    ).rejects.toThrow(/playlist detail/i);
  });
});

describe("YouTube album retrieval and capabilities", () => {
  it("maps album-page identity and the official item count without using playlist creation as the release date", async () => {
    request.mockImplementation(async (input: string) => {
      const url = String(input);
      if (url.startsWith("https://music.youtube.com/playlist?")) {
        return htmlResponse(hydration("browse", albumDocument("Legacy Code", "Faderhead", "2026", 12)));
      }
      if (url.startsWith("https://www.googleapis.com/youtube/v3/playlists?")) {
        return Response.json({
          kind: "youtube#playlistListResponse",
          items: [playlistDetails(FADERHEAD_ID, "Legacy Code", 12)],
        });
      }
      throw new Error("Unexpected provider request");
    });

    const album = await youtubeAdapter.getAlbum!(FADERHEAD_ID);

    expect(album).toMatchObject({
      sourceService: "youtube",
      sourceId: FADERHEAD_ID,
      title: "Legacy Code",
      artists: ["Faderhead"],
      releaseDate: "2026",
      totalTracks: 12,
      webUrl: `https://www.youtube.com/playlist?list=${FADERHEAD_ID}`,
    });
    expect(album.releaseDate).not.toBe("2026-09-28T17:23:21.787872Z");
  });

  it("declares album search without claiming direct album URL input", () => {
    expect(youtubeAdapter.detectAlbumUrl).toBeUndefined();
    expect(youtubeAdapter.albumCapabilities).toEqual({
      supportsUpc: false,
      supportsAlbumSearch: true,
      supportsTrackListing: false,
    });
  });
});
