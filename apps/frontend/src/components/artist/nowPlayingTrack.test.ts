import type { ArtistTopTrack } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import type { ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import {
  buildNowPlayingTrack,
  findNowPlayingRowIndex,
  type NowPlayingTrack,
} from "@/components/artist/nowPlayingTrack";
import { AudioStatus } from "@/components/audio/AudioStatus";
import { MediaCardContentTypeValue, type ShareContentConfiguration } from "@/lib/types/media-card";

const DEEZER_LINK = "https://www.deezer.com/track/67238732";

const CONFIG: ShareContentConfiguration = {
  type: MediaCardContentTypeValue.Share,
  title: "Instant Crush (feat. Julian Casablancas)",
  artist: "Daft Punk, Julian Casablancas",
  artworkUrl: "",
  platforms: [
    { platform: "spotify", url: "https://open.spotify.com/track/2cGxRwrMyEAp8dEbuZaVv6" },
    { platform: "deezer", url: DEEZER_LINK },
  ],
  platformsLabel: "",
  shortUrl: "https://musiccloud.local/JO_Qs",
  shortId: "JO_Qs",
};

function row(title: string, deezerUrl: string, overrides: Partial<ArtistTopTrack> = {}): ArtistTrackItem {
  return {
    track: {
      title,
      artists: ["Daft Punk", "Julian Casablancas"],
      albumName: null,
      artworkUrl: null,
      durationMs: null,
      deezerUrl,
      shortId: null,
      ...overrides,
    },
  };
}

function playing(overrides: Partial<NowPlayingTrack> = {}): NowPlayingTrack {
  return {
    status: AudioStatus.Playing,
    trackUrls: [],
    title: "Nothing On Screen",
    artist: "Nobody",
    ...overrides,
  };
}

describe("buildNowPlayingTrack", () => {
  it.each([
    null,
    AudioStatus.Loading,
    AudioStatus.Ready,
    AudioStatus.Ended,
    AudioStatus.Unavailable,
  ])("holds no track while the player is %s", (status) => {
    expect(buildNowPlayingTrack(CONFIG, null, status)).toBeNull();
  });

  it("describes the share's track by its links, short id, title and artist while it plays", () => {
    expect(buildNowPlayingTrack(CONFIG, null, AudioStatus.Playing)).toEqual({
      status: AudioStatus.Playing,
      trackUrls: ["https://open.spotify.com/track/2cGxRwrMyEAp8dEbuZaVv6", DEEZER_LINK],
      shortId: "JO_Qs",
      title: "Instant Crush (feat. Julian Casablancas)",
      artist: "Daft Punk, Julian Casablancas",
    });
  });

  it("keeps describing the track while it is paused, and adds the row it was resolved from", () => {
    const nowPlaying = buildNowPlayingTrack(CONFIG, "jamendo:309780", AudioStatus.Paused);

    expect(nowPlaying?.status).toBe(AudioStatus.Paused);
    expect(nowPlaying?.trackUrls).toContain("jamendo:309780");
  });
});

describe("findNowPlayingRowIndex", () => {
  it("finds no row while nothing plays", () => {
    expect(findNowPlayingRowIndex([row("Instant Crush", DEEZER_LINK)], null)).toBe(-1);
  });

  /** A share created from another service still carries the Deezer link the row was built from. */
  it("finds the row whose Deezer link is one of the share's links", () => {
    const items = [row("One More Time", "https://www.deezer.com/track/3135553"), row("Instant Crush", DEEZER_LINK)];

    expect(findNowPlayingRowIndex(items, playing({ trackUrls: [DEEZER_LINK] }))).toBe(1);
  });

  it("finds the row the track was resolved from by its candidate", () => {
    const items = [row("Glitter Bomb", "jamendo:309780"), row("Laziness", "jamendo:309781")];

    expect(findNowPlayingRowIndex(items, playing({ trackUrls: ["jamendo:309781"] }))).toBe(1);
  });

  it("finds the row by the short id the backend attached to it", () => {
    const items = [row("Around the World", "https://www.deezer.com/track/3129775", { shortId: "w6c9_" })];

    expect(findNowPlayingRowIndex(items, playing({ shortId: "w6c9_" }))).toBe(0);
  });

  /** A Creative Commons page opened directly knows neither the row's opaque candidate nor a short id for it. */
  it("falls back to the title and artist line when no identity matches", () => {
    const items = [
      row("Laziness", "jamendo:309781", { artists: ["Juanitos"] }),
      row("Glitter Bomb", "jamendo:309780", { artists: ["Juanitos"] }),
    ];

    expect(findNowPlayingRowIndex(items, playing({ title: " glitter bomb", artist: "JUANITOS " }))).toBe(1);
  });

  it("prefers a row matched by identity over an earlier row that only shares the title", () => {
    const items = [
      row("Instant Crush (feat. Julian Casablancas)", "https://www.deezer.com/track/1"),
      row("Instant Crush (feat. Julian Casablancas)", DEEZER_LINK),
    ];

    expect(
      findNowPlayingRowIndex(items, playing({ trackUrls: [DEEZER_LINK], title: CONFIG.title, artist: CONFIG.artist })),
    ).toBe(1);
  });

  it("does not take another artist's track that shares the title", () => {
    const items = [row("Intro", "https://www.deezer.com/track/9", { artists: ["The xx"] })];

    expect(findNowPlayingRowIndex(items, playing({ title: "Intro", artist: "M83" }))).toBe(-1);
  });
});
