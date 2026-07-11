import type { VinylLayout } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { buildShareViewFromSharePageResponse } from "@/lib/share/share-view";
import { ActiveResultKind, type AlbumResult, type SongResult } from "@/lib/types/app";
import { buildActiveConfig, buildShareConfigFromActive, parseUnifiedResolveResponse } from "./parsers";

const t = (key: string, vars?: Record<string, string>) => (vars?.count ? `${key}:${vars.count}` : key);

const VINYL_LAYOUT: VinylLayout = {
  discogsReleaseId: "10013707",
  sides: [
    {
      label: "A",
      tracks: [{ position: "A1", title: "The Sermon!", durationMs: 1167000 }],
    },
  ],
};

describe("media-card LP label fields", () => {
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

    expect(buildActiveConfig(track, t).vinylLayout).toEqual(VINYL_LAYOUT);
    expect(buildActiveConfig(album, t).vinylLayout).toEqual(VINYL_LAYOUT);
    expect(buildShareConfigFromActive(track, t).vinylLayout).toEqual(VINYL_LAYOUT);
    expect(buildShareConfigFromActive(album, t).vinylLayout).toEqual(VINYL_LAYOUT);
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

    expect(buildActiveConfig(active, t).vinylLayout).toBeUndefined();
    expect(buildShareConfigFromActive(active, t).vinylLayout).toBeUndefined();
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

    expect(buildActiveConfig(song, t)).toMatchObject({
      labelAlbumTitle: "Kind of Blue",
      labelCatalogText: "ISRC USSM15900001",
      labelReleaseYear: "1959",
    });
    expect(buildShareConfigFromActive(album, t)).toMatchObject({
      labelAlbumTitle: "Blue Train",
      labelCatalogText: "UPC 724349534428",
      labelReleaseYear: "1958",
    });
  });

  it("populates structured label fields from share-page API data", () => {
    const view = buildShareViewFromSharePageResponse(
      {
        type: "track",
        og: { title: "", description: "", url: "https://musiccloud.local/s/track" },
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
      t,
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
        og: { title: "", description: "", url: "https://musiccloud.local/s/track" },
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
      t,
    );
    const albumView = buildShareViewFromSharePageResponse(
      {
        type: "album",
        og: { title: "", description: "", url: "https://musiccloud.local/s/album" },
        shortUrl: "https://musiccloud.local/s/album",
        links: [],
        album: {
          title: "The Sermon!",
          artists: ["Jimmy Smith"],
          vinylLayout: VINYL_LAYOUT,
        },
      } as Parameters<typeof buildShareViewFromSharePageResponse>[0],
      "album",
      t,
    );

    expect(trackView.config.vinylLayout).toEqual(VINYL_LAYOUT);
    expect(albumView.config.vinylLayout).toEqual(VINYL_LAYOUT);
  });

  it("keeps the vinyl layout optional when a share payload has no layout", () => {
    const view = buildShareViewFromSharePageResponse(
      {
        type: "track",
        og: { title: "", description: "", url: "https://musiccloud.local/s/track" },
        shortUrl: "https://musiccloud.local/s/track",
        links: [],
        track: {
          title: "Without a pressing",
          artists: ["Unknown Artist"],
          vinylLayout: null,
        },
      } as Parameters<typeof buildShareViewFromSharePageResponse>[0],
      "track",
      t,
    );

    expect(view.config.vinylLayout).toBeUndefined();
  });
});
