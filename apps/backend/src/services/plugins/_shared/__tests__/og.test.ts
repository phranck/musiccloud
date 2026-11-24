import { describe, expect, it } from "vitest";
import { extractOgTags } from "../og.js";

/** The OG fallback page of the Beatport getTrack test in `beatport/__tests__/beatport.test.ts`. */
const BEATPORT_PAGE =
  '<html><meta property="og:title" content="deadmau5 - Strobe (Original Mix) [Virgin] | Music & Downloads on Beatport"><meta property="og:image" content="https://geo-media.beatport.com/test.jpg"></html>';

describe("extractOgTags", () => {
  it("reads the title and image Beatport's fallback reads", () => {
    expect(extractOgTags(BEATPORT_PAGE)).toEqual({
      title: "deadmau5 - Strobe (Original Mix) [Virgin] | Music & Downloads on Beatport",
      image: "https://geo-media.beatport.com/test.jpg",
    });
  });

  it("reads an empty content as an empty string", () => {
    expect(extractOgTags('<meta property="og:image" content="">').image).toBe("");
  });

  it("returns an empty map for a page without OG tags", () => {
    expect(extractOgTags("<html></html>")).toEqual({});
  });
});
