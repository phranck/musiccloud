import type { CcArtistInfoResponse, VinylLayout } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { buildShareViewFromSharePageResponse } from "@/lib/share/share-view";
import { ActiveResultKind, type AlbumResult, type SongResult } from "@/lib/types/app";
import {
  buildActiveConfig,
  buildShareConfigFromActive,
  ccResolveDataToResult,
  ccResponseToResult,
  ccResultToShareProps,
  formatResolveErrorMessage,
  parseResolveError,
  parseUnifiedResolveResponse,
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
});
