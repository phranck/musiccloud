import { describe, expect, it } from "vitest";
import { parseLastfmUrl } from "../url-search";

describe("parseLastfmUrl", () => {
  it("searches a track link by its title and its artist", () => {
    expect(parseLastfmUrl("https://www.last.fm/music/F%C3%B6n/_/Fort+Collins")).toEqual({
      text: "Fön - Fort Collins",
      structured: { title: "Fort Collins", artist: "Fön" },
    });
  });

  it("keeps a literal plus sign in an artist name", () => {
    expect(parseLastfmUrl("https://www.last.fm/music/Florence+%2B+The+Machine/_/Dog+Days+Are+Over")).toEqual({
      text: "Florence + The Machine - Dog Days Are Over",
      structured: { title: "Dog Days Are Over", artist: "Florence + The Machine" },
    });
  });

  it("searches album and artist links as free text", () => {
    expect(parseLastfmUrl("https://www.last.fm/music/F%C3%B6n/Wir+Haben+Zeit")).toEqual({
      text: "Fön - Wir Haben Zeit",
    });
    expect(parseLastfmUrl("https://last.fm/music/F%C3%B6n")).toEqual({ text: "Fön" });
  });

  it("ignores links that are not Last.fm music pages", () => {
    expect(parseLastfmUrl("https://www.deezer.com/track/485530522")).toBeNull();
    expect(parseLastfmUrl("https://www.last.fm/user/someone")).toBeNull();
    expect(parseLastfmUrl("not a url")).toBeNull();
  });
});
