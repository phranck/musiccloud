import { describe, expect, it } from "vitest";
import { scrapeIds } from "../scrape-ids.js";

/** The id pattern of a search page that links its hits as `/track/{id}`. */
const TRACK_LINK = /\/track\/(\d+)/g;

/** The cap the scraping adapters use. */
const LIMIT = 5;

describe("scrapeIds", () => {
  it("keeps distinct ids in page order", () => {
    const html = '<a href="/track/3"></a><a href="/track/1"></a><a href="/track/3"></a><a href="/track/2"></a>';
    expect(scrapeIds(html, TRACK_LINK, LIMIT)).toEqual(["3", "1", "2"]);
  });

  it("stops at the limit of distinct ids", () => {
    const html = Array.from({ length: 8 }, (_unused, index) => `/track/${index}`).join(" ");
    expect(scrapeIds(html, TRACK_LINK, LIMIT)).toEqual(["0", "1", "2", "3", "4"]);
  });

  it("does not count repeats toward the limit", () => {
    const html = "/track/1 /track/1 /track/1 /track/1 /track/1 /track/2";
    expect(scrapeIds(html, TRACK_LINK, LIMIT)).toEqual(["1", "2"]);
  });

  it("returns an empty list for a page without ids", () => {
    expect(scrapeIds("<html></html>", TRACK_LINK, LIMIT)).toEqual([]);
  });

  it("can be called again with the same pattern", () => {
    expect(scrapeIds("/track/7", TRACK_LINK, LIMIT)).toEqual(["7"]);
    expect(scrapeIds("/track/7", TRACK_LINK, LIMIT)).toEqual(["7"]);
  });
});
