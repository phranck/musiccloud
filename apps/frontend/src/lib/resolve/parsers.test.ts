import { type CcArtistInfoResponse, Service, type VinylLayout } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { resultsCopy } from "@/copy/results";
import { buildShareViewFromSharePageResponse } from "@/lib/share/share-view";
import { ActiveResultKind, type AlbumResult, type ArtistResult, type SongResult } from "@/lib/types/app";
import {
  albumMetaLine,
  buildActiveConfig,
  buildShareConfigFromActive,
  ccResolveDataToResult,
  ccResponseToResult,
  ccResultToShareProps,
  formatResolveErrorMessage,
  parseResolveError,
  parseUnifiedResolveResponse,
  ResolveApiError,
} from "./parsers";

const VINYL_LAYOUT: VinylLayout = {
  discogsReleaseId: "10013707",
  sides: [
    {
      label: "A",
      tracks: [{ position: "A1", title: "The Sermon!", durationMs: 1167000 }],
    },
  ],
};

const CC_ARTIST_INFO: CcArtistInfoResponse = {
  artistName: "Jimmy Smith",
  topTracks: [],
  profile: null,
  events: [],
  similarArtistTracks: [],
};

describe("media-card LP label fields", () => {
  it("preserves CC track and album layouts from live resolves through the turntable config", () => {
    const track = ccResolveDataToResult({
      type: "cc-track",
      id: "cc-track-id",
      shortUrl: "https://musiccloud.local/cc-track",
      track: {
        jamendoId: "track-1",
        title: "The Sermon!",
        artistName: "Jimmy Smith",
        jamendoArtistId: "artist-1",
        albumName: "The Sermon!",
        streamUrl: "https://cdn.example/track.mp3",
        downloadAllowed: false,
        vinylLayout: VINYL_LAYOUT,
      },
    });
    const album = ccResolveDataToResult({
      type: "cc-album",
      id: "cc-album-id",
      shortUrl: "https://musiccloud.local/cc-album",
      album: {
        jamendoId: "album-1",
        name: "The Sermon!",
        artistName: "Jimmy Smith",
        tracks: [],
        vinylLayout: VINYL_LAYOUT,
      },
      artistInfo: CC_ARTIST_INFO,
    });

    expect(ccResultToShareProps(track).config.vinylLayout).toEqual(VINYL_LAYOUT);
    expect(ccResultToShareProps(album).config.vinylLayout).toEqual(VINYL_LAYOUT);
  });

  it("preserves cached CC track and album layouts through the persistent share parser", () => {
    const track = ccResponseToResult({
      type: "cc-track",
      og: { title: "", description: "", image: "", url: "https://musiccloud.local/cc-track" },
      shortUrl: "https://musiccloud.local/cc-track",
      track: {
        jamendoId: "track-1",
        title: "The Sermon!",
        artistName: "Jimmy Smith",
        jamendoArtistId: "artist-1",
        albumName: "The Sermon!",
        streamUrl: "https://cdn.example/track.mp3",
        downloadAllowed: false,
        vinylLayout: VINYL_LAYOUT,
      },
    });
    const album = ccResponseToResult({
      type: "cc-album",
      og: { title: "", description: "", image: "", url: "https://musiccloud.local/cc-album" },
      shortUrl: "https://musiccloud.local/cc-album",
      album: {
        jamendoId: "album-1",
        name: "The Sermon!",
        artistName: "Jimmy Smith",
        tracks: [],
        vinylLayout: VINYL_LAYOUT,
      },
      artistInfo: CC_ARTIST_INFO,
    });

    expect(ccResultToShareProps(track).config.vinylLayout).toEqual(VINYL_LAYOUT);
    expect(ccResultToShareProps(album).config.vinylLayout).toEqual(VINYL_LAYOUT);
  });

  it("preserves a resolve vinyl layout from track and album payloads through the view model", () => {
    const track = parseUnifiedResolveResponse({
      type: "track",
      id: "track-id",
      shortUrl: "https://musiccloud.local/s/track",
      links: [],
      track: {
        title: "The Sermon!",
        artists: ["Jimmy Smith"],
        albumName: "The Sermon!",
        vinylLayout: VINYL_LAYOUT,
      },
    });
    const album = parseUnifiedResolveResponse({
      type: "album",
      id: "album-id",
      shortUrl: "https://musiccloud.local/s/album",
      links: [],
      album: {
        title: "The Sermon!",
        artists: ["Jimmy Smith"],
        vinylLayout: VINYL_LAYOUT,
      },
    });

    expect(buildActiveConfig(track).vinylLayout).toEqual(VINYL_LAYOUT);
    expect(buildActiveConfig(album).vinylLayout).toEqual(VINYL_LAYOUT);
    expect(buildShareConfigFromActive(track).vinylLayout).toEqual(VINYL_LAYOUT);
    expect(buildShareConfigFromActive(album).vinylLayout).toEqual(VINYL_LAYOUT);
  });

  it("keeps the vinyl layout optional when a resolve payload has no layout", () => {
    const active = parseUnifiedResolveResponse({
      type: "track",
      id: "track-id",
      shortUrl: "https://musiccloud.local/s/track",
      links: [],
      track: {
        title: "Without a pressing",
        artists: ["Unknown Artist"],
        vinylLayout: null,
      },
    });

    expect(buildActiveConfig(active).vinylLayout).toBeUndefined();
    expect(buildShareConfigFromActive(active).vinylLayout).toBeUndefined();
  });

  it("populates structured label fields for active song and album configs", () => {
    const song: SongResult = {
      kind: ActiveResultKind.Song,
      title: "So What",
      artist: "Miles Davis",
      album: "Kind of Blue",
      releaseDate: "1959-08-17",
      durationMs: 545000,
      isrc: "USSM15900001",
      artworkUrl: "/kind-of-blue.jpg",
      platforms: [],
      shareUrl: "https://musiccloud.local/s/kob",
    };
    const album: AlbumResult = {
      kind: ActiveResultKind.Album,
      title: "Blue Train",
      artist: "John Coltrane",
      releaseDate: "1958-01-01",
      totalTracks: 5,
      upc: "724349534428",
      artworkUrl: "/blue-train.jpg",
      platforms: [],
      shareUrl: "https://musiccloud.local/s/blue",
    };

    expect(buildActiveConfig(song)).toMatchObject({
      labelAlbumTitle: "Kind of Blue",
      labelCatalogText: "ISRC USSM15900001",
      labelReleaseYear: "1959",
    });
    expect(buildShareConfigFromActive(album)).toMatchObject({
      labelAlbumTitle: "Blue Train",
      labelCatalogText: "UPC 724349534428",
      labelReleaseYear: "1958",
    });
  });

  it("populates structured label fields from share-page API data", () => {
    const view = buildShareViewFromSharePageResponse(
      {
        type: "track",
        og: { title: "", description: "", image: "", url: "https://musiccloud.local/s/track" },
        shortUrl: "https://musiccloud.local/s/track",
        links: [],
        track: {
          title: "Blue in Green",
          artists: ["Miles Davis"],
          albumName: "Kind of Blue",
          releaseDate: "1959-08-17",
          durationMs: 337000,
          isrc: "USSM15900002",
          artworkUrl: "/blue-in-green.jpg",
          vinylLayout: null,
        },
      } as Parameters<typeof buildShareViewFromSharePageResponse>[0],
      "track",
    );

    expect(view.config).toMatchObject({
      labelAlbumTitle: "Kind of Blue",
      labelCatalogText: "ISRC USSM15900002",
      labelReleaseYear: "1959",
    });
  });

  it("preserves a share vinyl layout from track and album payloads", () => {
    const trackView = buildShareViewFromSharePageResponse(
      {
        type: "track",
        og: { title: "", description: "", image: "", url: "https://musiccloud.local/s/track" },
        shortUrl: "https://musiccloud.local/s/track",
        links: [],
        track: {
          title: "The Sermon!",
          artists: ["Jimmy Smith"],
          albumName: "The Sermon!",
          vinylLayout: VINYL_LAYOUT,
        },
      } as Parameters<typeof buildShareViewFromSharePageResponse>[0],
      "track",
    );
    const albumView = buildShareViewFromSharePageResponse(
      {
        type: "album",
        og: { title: "", description: "", image: "", url: "https://musiccloud.local/s/album" },
        shortUrl: "https://musiccloud.local/s/album",
        links: [],
        album: {
          title: "The Sermon!",
          artists: ["Jimmy Smith"],
          vinylLayout: VINYL_LAYOUT,
        },
      } as Parameters<typeof buildShareViewFromSharePageResponse>[0],
      "album",
    );

    expect(trackView.config.vinylLayout).toEqual(VINYL_LAYOUT);
    expect(albumView.config.vinylLayout).toEqual(VINYL_LAYOUT);
  });

  it("keeps the vinyl layout optional when a share payload has no layout", () => {
    const view = buildShareViewFromSharePageResponse(
      {
        type: "track",
        og: { title: "", description: "", image: "", url: "https://musiccloud.local/s/track" },
        shortUrl: "https://musiccloud.local/s/track",
        links: [],
        track: {
          title: "Without a pressing",
          artists: ["Unknown Artist"],
          vinylLayout: null,
        },
      } as Parameters<typeof buildShareViewFromSharePageResponse>[0],
      "track",
    );

    expect(view.config.vinylLayout).toBeUndefined();
  });
});

describe("Creative Commons results list Jamendo as their service", () => {
  const TRACK_PAGE = "https://www.jamendo.com/track/459544/everybody-loves-the-partys";
  const ALBUM_PAGE = "https://www.jamendo.com/album/54844/best-of-vol-2";
  const ARTIST_PAGE = "https://www.jamendo.com/artist/5261/juanitos";

  it("gives a live track, album and artist result one Jamendo link under the matching title", () => {
    const track = ccResolveDataToResult({
      type: "cc-track",
      id: "cc-track-id",
      shortUrl: "https://musiccloud.local/cc-track",
      track: {
        jamendoId: "459544",
        title: "Everybody Loves The Partys",
        artistName: "Juanitos",
        jamendoArtistId: "5261",
        streamUrl: "https://cdn.example/track.mp3",
        downloadAllowed: false,
        shareUrl: TRACK_PAGE,
        vinylLayout: null,
      },
    });
    const album = ccResolveDataToResult({
      type: "cc-album",
      id: "cc-album-id",
      shortUrl: "https://musiccloud.local/cc-album",
      album: {
        jamendoId: "54844",
        name: "Best of Vol.2",
        artistName: "Juanitos",
        tracks: [],
        shareUrl: ALBUM_PAGE,
        vinylLayout: null,
      },
      artistInfo: CC_ARTIST_INFO,
    });
    const artist = ccResolveDataToResult({
      type: "cc-artist",
      id: "cc-artist-id",
      shortUrl: "https://musiccloud.local/cc-artist",
      artist: { jamendoId: "5261", name: "Juanitos", shareUrl: ARTIST_PAGE, topTracks: [] },
      artistInfo: CC_ARTIST_INFO,
    });

    expect(ccResultToShareProps(track).config).toMatchObject({
      platforms: [{ platform: Service.Jamendo, url: TRACK_PAGE }],
      platformsLabel: resultsCopy.listenOn,
    });
    expect(ccResultToShareProps(album).config).toMatchObject({
      platforms: [{ platform: Service.Jamendo, url: ALBUM_PAGE }],
      platformsLabel: resultsCopy.openAlbumOn,
    });
    expect(ccResultToShareProps(artist).config).toMatchObject({
      platforms: [{ platform: Service.Jamendo, url: ARTIST_PAGE }],
      platformsLabel: resultsCopy.viewArtistOn,
    });
  });

  it("gives a persisted share page the same Jamendo link", () => {
    const album = ccResponseToResult({
      type: "cc-album",
      og: { title: "", description: "", image: "", url: "https://musiccloud.local/cc-album" },
      shortUrl: "https://musiccloud.local/cc-album",
      album: {
        jamendoId: "54844",
        name: "Best of Vol.2",
        artistName: "Juanitos",
        tracks: [],
        shareUrl: ALBUM_PAGE,
        vinylLayout: null,
      },
      artistInfo: CC_ARTIST_INFO,
    });

    expect(ccResultToShareProps(album).config.platforms).toEqual([{ platform: Service.Jamendo, url: ALBUM_PAGE }]);
  });

  it("lists no service when Jamendo sent no page link", () => {
    const artist = ccResolveDataToResult({
      type: "cc-artist",
      id: "cc-artist-id",
      shortUrl: "https://musiccloud.local/cc-artist",
      artist: { jamendoId: "5261", name: "Juanitos", topTracks: [] },
      artistInfo: CC_ARTIST_INFO,
    });

    expect(ccResultToShareProps(artist).config.platforms).toEqual([]);
  });
});

describe("album and artist cards say what they are", () => {
  const ARTIST: ArtistResult = {
    kind: ActiveResultKind.Artist,
    name: "Massive Attack",
    imageUrl: "",
    platforms: [],
    shareUrl: "https://musiccloud.local/s/ma",
  };

  it("joins track count and year with a spaced middle dot", () => {
    expect(albumMetaLine(11, "2009-11-04")).toBe("11 tracks · 2009");
    expect(albumMetaLine(undefined, "2009-11-04")).toBe("2009");
    expect(albumMetaLine(undefined, undefined)).toBeUndefined();
  });

  it("gives a commercial album card its track count, on the landing result and the share config", () => {
    const album: AlbumResult = {
      kind: ActiveResultKind.Album,
      title: "Blue Train",
      artist: "John Coltrane",
      releaseDate: "1958-01-01",
      totalTracks: 5,
      artworkUrl: "",
      platforms: [],
      shareUrl: "https://musiccloud.local/s/blue",
    };
    expect(buildActiveConfig(album).metaLine).toBe("5 tracks · 1958");
    expect(buildShareConfigFromActive(album).metaLine).toBe("5 tracks · 1958");
  });

  it("names the kind on a commercial artist card, from the landing result and the share page", () => {
    expect(buildActiveConfig(ARTIST).kindLine).toBe(resultsCopy.artistKind);
    expect(buildShareConfigFromActive(ARTIST).kindLine).toBe(resultsCopy.artistKind);

    const view = buildShareViewFromSharePageResponse(
      {
        type: "artist",
        og: { title: "", description: "", image: "", url: "https://musiccloud.local/s/ma" },
        shortUrl: "https://musiccloud.local/s/ma",
        links: [],
        artist: { name: "Massive Attack" },
      } as Parameters<typeof buildShareViewFromSharePageResponse>[0],
      "ma",
    );
    expect(view.config.kindLine).toBe(resultsCopy.artistKind);
  });

  it("names the kind on a Creative Commons artist and counts a Creative Commons album's tracks", () => {
    const artist = ccResolveDataToResult({
      type: "cc-artist",
      id: "cc-artist-id",
      shortUrl: "https://musiccloud.local/cc-artist",
      artist: { jamendoId: "5261", name: "Juanitos", topTracks: [] },
      artistInfo: CC_ARTIST_INFO,
    });
    const album = ccResponseToResult({
      type: "cc-album",
      og: { title: "", description: "", image: "", url: "https://musiccloud.local/cc-album" },
      shortUrl: "https://musiccloud.local/cc-album",
      album: {
        jamendoId: "54844",
        name: "Best of Vol.2",
        artistName: "Juanitos",
        releaseDate: "2009-11-04",
        tracks: Array.from({ length: 11 }, (_, index) => ({
          jamendoId: `t${index}`,
          title: `Track ${index}`,
          artistName: "Juanitos",
          jamendoArtistId: "5261",
          streamUrl: "https://cdn.example/track.mp3",
          downloadAllowed: false,
        })),
        vinylLayout: null,
      },
      artistInfo: CC_ARTIST_INFO,
    });

    expect(ccResultToShareProps(artist).config.kindLine).toBe(resultsCopy.artistKind);
    expect(ccResultToShareProps(album).config.metaLine).toBe("11 tracks · 2009");
    expect(ccResultToShareProps(album).config.kindLine).toBeUndefined();
  });
});

describe("English resolve errors", () => {
  it("maps network and timeout failures without translation keys", () => {
    expect(formatResolveErrorMessage(parseResolveError(new TypeError("Failed to fetch")))).toBe(
      "Looks like you're offline. Check your connection and try again.",
    );

    const timeout = new Error("aborted");
    timeout.name = "AbortError";
    expect(formatResolveErrorMessage(parseResolveError(timeout))).toBe(
      "This is taking longer than usual. Please try again.",
    );
  });

  it("preserves known and unknown backend error codes", () => {
    expect(
      formatResolveErrorMessage({
        kind: "backend",
        code: "MC-API-0003",
        context: { limit: "10", windowSeconds: "60", retryAfterSeconds: "5" },
      }),
    ).toContain("(MC-API-0003)");
    expect(formatResolveErrorMessage({ kind: "backend", code: "MC-API-3999" })).toBe(
      "Something went wrong. Please try again. (MC-API-3999)",
    );
  });

  /**
   * The error ID connects a visitor's report to the log line that explains it.
   * The parser used to drop it, so the dialog showed the code alone.
   */
  it("keeps the backend's error ID and shows it with the message", () => {
    const error = parseResolveError(
      new ResolveApiError({ error: "MC-API-3999", errorId: "4f1c2d9e-6a2b-4c55-9d1e-2b7f8a1c0e33" }),
    );

    expect(error).toMatchObject({ kind: "backend", errorId: "4f1c2d9e-6a2b-4c55-9d1e-2b7f8a1c0e33" });
    expect(formatResolveErrorMessage(error)).toBe(
      "Something went wrong. Please try again. (MC-API-3999) Error ID: 4f1c2d9e-6a2b-4c55-9d1e-2b7f8a1c0e33",
    );
  });
});
