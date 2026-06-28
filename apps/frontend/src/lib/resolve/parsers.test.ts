import { describe, expect, it } from "vitest";
import { buildShareViewFromSharePageResponse } from "@/lib/share/share-view";
import { ActiveResultKind, type AlbumResult, type SongResult } from "@/lib/types/app";
import { buildActiveConfig, buildShareConfigFromActive } from "./parsers";

const t = (key: string, vars?: Record<string, string>) => (vars?.count ? `${key}:${vars.count}` : key);

describe("media-card LP label fields", () => {
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
});
