import { describe, expect, it } from "vitest";
import type { ArtistPartial } from "../artist-composition/types.js";
import { composeArtistProfileSnapshot } from "../artist-info.js";

describe("artist profile provenance", () => {
  it("records only providers that contribute selected usable profile fields", () => {
    const partials: ArtistPartial[] = [
      {
        __source: "spotify",
        imageUrl: "https://spotify.test/image.jpg",
        genres: ["electronic"],
      },
      {
        __source: "deezer",
        imageUrl: "https://deezer.test/image.jpg",
        followers: 420,
      },
      {
        __source: "lastfm",
        bioSummary: "A useful biography",
        scrobbles: 9_000,
      },
    ];

    const snapshot = composeArtistProfileSnapshot(partials, "Artist One");

    expect(snapshot?.profile).toMatchObject({
      imageUrl: "https://deezer.test/image.jpg",
      genres: ["electronic"],
      followers: 420,
      bioSummary: "A useful biography",
      scrobbles: 9_000,
    });
    expect(snapshot?.providers).toEqual(["spotify", "deezer", "lastfm"]);
  });

  it("omits available providers that do not win any profile field", () => {
    const partials: ArtistPartial[] = [
      {
        __source: "spotify",
        imageUrl: "https://spotify.test/image.jpg",
      },
      {
        __source: "deezer",
        imageUrl: "https://deezer.test/image.jpg",
      },
      {
        __source: "lastfm",
        topTracks: [],
      },
    ];

    expect(composeArtistProfileSnapshot(partials, "Artist Two")?.providers).toEqual(["deezer"]);
  });

  it("returns null when no provider produced a partial", () => {
    expect(composeArtistProfileSnapshot([null, null, null], "Artist Three")).toBeNull();
  });
});
