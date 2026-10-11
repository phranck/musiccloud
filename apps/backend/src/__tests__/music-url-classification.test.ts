/**
 * The resolve routes send a link to the album, artist or track pipeline by
 * asking `classifyMusicUrl`, which returns the kind of the first detector that
 * claims the link. That only works while exactly one detector across all
 * plugins claims each link: a second claimant would decide the pipeline by
 * nothing more than the order the detectors are asked in.
 *
 * The fixture holds one sample link per detector. A plugin that gains a
 * detector without a sample fails the first test, so the guarantee covers
 * every plugin the registry lists rather than the ones somebody remembered.
 */
import { describe, expect, it } from "vitest";
import { classifyMusicUrl, listPlugins, type MusicUrlKind } from "../services/plugins/registry.js";
import type { ServiceAdapter } from "../services/types.js";

type UrlDetector = (url: string) => string | null;

/** One sample link for each detector a plugin has, keyed by plugin id. */
const SAMPLES: Record<string, Partial<Record<MusicUrlKind, string>>> = {
  deezer: {
    track: "https://www.deezer.com/track/3135556",
    album: "https://www.deezer.com/album/302127",
    artist: "https://www.deezer.com/artist/1",
  },
  "apple-music": {
    track: "https://music.apple.com/de/album/bohemian-rhapsody/1440806041?i=1440806768",
    album: "https://music.apple.com/us/album/a-night-at-the-opera/1440806041",
    artist: "https://music.apple.com/us/artist/queen/3296287",
  },
  tidal: {
    track: "https://tidal.com/browse/track/12345",
    album: "https://tidal.com/browse/album/95477688",
    artist: "https://tidal.com/browse/artist/1566",
  },
  youtube: {
    track: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
    artist: "https://www.youtube.com/@kreatorofficial",
  },
  spotify: {
    track: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    album: "https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE",
    artist: "https://open.spotify.com/artist/72X6FHxaShda0XeQw3vbeF",
  },
  musicbrainz: {
    track: "https://musicbrainz.org/recording/69c62fec-0694-4279-b73e-0d83ae3ae09c",
    album: "https://musicbrainz.org/release/1c6cb41b-0b5e-4d9e-9f8a-4c7a7c5e2b1a",
    artist: "https://musicbrainz.org/artist/b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d",
  },
  audius: {
    track: "https://audius.co/deadmau5/unlucky-work-in-progress-333797",
    album: "https://audius.co/deadmau5/album/where-is-the-love-12345",
  },
  napster: {
    track: "https://app.napster.com/artist/coldplay/album/parachutes/track/yellow",
    artist: "https://app.napster.com/artist/coldplay",
  },
  soundcloud: {
    track: "https://soundcloud.com/taylorswift/shake-it-off",
    album: "https://soundcloud.com/taylorswift/sets/1989",
    artist: "https://soundcloud.com/taylorswift",
  },
  pandora: {
    track:
      "https://www.pandora.com/artist/taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6",
    album: "https://www.pandora.com/artist/taylor-swift/1989-taylors-version-deluxe/ALZ5ZXgKb2c4kVd",
  },
  qobuz: {
    track: "https://open.qobuz.com/track/59954869",
    album: "https://open.qobuz.com/album/0060253780968",
    artist: "https://open.qobuz.com/artist/36819",
  },
  boomplay: {
    track: "https://www.boomplay.com/songs/12345",
    album: "https://www.boomplay.com/albums/1234",
  },
  kkbox: {
    track: "https://www.kkbox.com/tw/tc/song/ABC123_-x",
    album: "https://www.kkbox.com/tw/en/album/abc123",
    artist: "https://www.kkbox.com/tw/tc/artist/OpYn0tBqZ4zG2Sk3wZ",
  },
  bandcamp: {
    track: "https://faderhead.bandcamp.com/track/hungry-or-a-liar-cyberpunk-rework",
    album: "https://radiohead.bandcamp.com/album/ok-computer",
  },
  audiomack: {
    track: "https://audiomack.com/drake/song/gods-plan",
    album: "https://audiomack.com/drake/album/test",
  },
  netease: {
    track: "https://music.163.com/#/song?id=789012",
    album: "https://music.163.com/album?id=123",
    artist: "https://music.163.com/#/artist?id=6452",
  },
  qqmusic: {
    track: "https://y.qq.com/n/ryqq/songDetail/001BLpXF2DyJe2",
    album: "https://y.qq.com/n/ryqq/albumDetail/123",
  },
  melon: {
    track: "https://www.melon.com/song/detail.htm?songId=12345",
    album: "https://www.melon.com/album/detail.htm?albumId=123",
  },
  bugs: {
    track: "https://music.bugs.co.kr/track/6199298",
    album: "https://music.bugs.co.kr/album/20123456",
  },
  jiosaavn: {
    track: "https://www.jiosaavn.com/song/test-song/ABC123",
    album: "https://www.jiosaavn.com/album/aashiqui-2/7f3m-bTzEx0_",
    artist: "https://www.jiosaavn.com/artist/arijit-singh-songs/LlRWpHzy3Hk_",
  },
  beatport: {
    track: "https://www.beatport.com/track/some-track/12345",
    album: "https://www.beatport.com/release/opus/1793734",
  },
};

/**
 * Lists the detectors an adapter has, each with the kind it stands for.
 *
 * @param adapter - The plugin's adapter.
 * @returns `track` always, then `album` and `artist` where the adapter defines them.
 */
function detectorsOf(adapter: ServiceAdapter): Array<[MusicUrlKind, UrlDetector]> {
  const detectors: Array<[MusicUrlKind, UrlDetector]> = [["track", (url) => adapter.detectUrl(url)]];
  if (adapter.detectAlbumUrl) detectors.push(["album", (url) => adapter.detectAlbumUrl?.(url) ?? null]);
  if (adapter.detectArtistUrl) detectors.push(["artist", (url) => adapter.detectArtistUrl?.(url) ?? null]);
  return detectors;
}

const cases = listPlugins().flatMap((plugin) =>
  detectorsOf(plugin.adapter).map(([kind]) => ({ pluginId: plugin.manifest.id, kind })),
);

/** Every detector of every plugin that claims `url`, as `pluginId:kind`. */
function claimantsOf(url: string): string[] {
  return listPlugins().flatMap((plugin) =>
    detectorsOf(plugin.adapter)
      .filter(([, detect]) => detect(url) !== null)
      .map(([kind]) => `${plugin.manifest.id}:${kind}`),
  );
}

describe("classifyMusicUrl", () => {
  it("has a sample link for every detector of every plugin, and none for a detector that does not exist", () => {
    const missing = cases
      .filter(({ pluginId, kind }) => !SAMPLES[pluginId]?.[kind])
      .map(({ pluginId, kind }) => `${pluginId}:${kind}`);
    const detectorKeys = new Set(cases.map(({ pluginId, kind }) => `${pluginId}:${kind}`));
    const orphaned = Object.entries(SAMPLES).flatMap(([pluginId, samples]) =>
      Object.keys(samples)
        .map((kind) => `${pluginId}:${kind}`)
        .filter((key) => !detectorKeys.has(key)),
    );
    expect(missing).toEqual([]);
    expect(orphaned).toEqual([]);
  });

  it.each(cases)("routes the $pluginId $kind sample to the $kind pipeline", ({ pluginId, kind }) => {
    const sample = SAMPLES[pluginId]?.[kind];
    if (!sample) return;
    expect(claimantsOf(sample)).toEqual([`${pluginId}:${kind}`]);
    expect(classifyMusicUrl(sample)).toBe(kind);
  });

  it("classifies a localized Spotify album link as an album", () => {
    expect(classifyMusicUrl("https://open.spotify.com/intl-de/album/6dVIqQ8qmQ5GBnJ9shOYGE")).toBe("album");
  });

  it("returns null for a link no plugin claims", () => {
    expect(classifyMusicUrl("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")).toBeNull();
    expect(classifyMusicUrl("https://youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf")).toBeNull();
    expect(classifyMusicUrl("https://music.youtube.com/playlist?list=OLAK5uy_abc123")).toBeNull();
    expect(classifyMusicUrl("https://audius.co/deadmau5/playlist/my-mix-12345")).toBeNull();
    expect(classifyMusicUrl("https://www.google.com/search?q=music")).toBeNull();
    expect(classifyMusicUrl("Bohemian Rhapsody Queen")).toBeNull();
  });
});
