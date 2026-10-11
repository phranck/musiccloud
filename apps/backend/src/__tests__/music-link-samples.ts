import type { MusicUrlKind } from "../services/plugins/registry.js";

/**
 * One sample link for each detector a plugin has, keyed by plugin id.
 *
 * `music-url-classification.test.ts` fails when a plugin gains a detector
 * without a sample here, and `music-links-plugins.test.ts` checks every sample
 * against the shared host table. Both read this one set, so a service whose
 * links change shape is corrected in one place for both.
 */
export const MUSIC_LINK_SAMPLES: Record<string, Partial<Record<MusicUrlKind, string>>> = {
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
