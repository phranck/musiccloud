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

  it("decodes the entities a page writes into a content attribute", () => {
    const page =
      '<meta property="og:title" content="God&#x27;s Plan &amp; More &quot;Live&quot;"><meta property="og:image" content="https://example.test/a.jpg?w=1&amp;h=1">';
    expect(extractOgTags(page)).toEqual({
      title: 'God\'s Plan & More "Live"',
      image: "https://example.test/a.jpg?w=1&h=1",
    });
  });

  it("decodes an escaped entity only once", () => {
    expect(extractOgTags('<meta property="og:title" content="A &amp;lt;B&amp;gt;">').title).toBe("A &lt;B&gt;");
  });

  it("returns an empty map for a page without OG tags", () => {
    expect(extractOgTags("<html></html>")).toEqual({});
  });
});
