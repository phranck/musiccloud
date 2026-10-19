import { describe, expect, it } from "vitest";
import type { NormalizedTrack } from "../../../types.js";
import { isTrackSearchFallbackMatch } from "../track-search-query.js";

/** A title can equal its artist without turning known recording metadata into a free-text query. */
describe("recording metadata query interpretation", () => {
  const unrelated: NormalizedTrack = {
    sourceService: "deezer",
    sourceId: "fixture",
    title: "Black Sabbath",
    artists: ["Another Artist"],
    durationMs: 300000,
    webUrl: "https://www.deezer.com/track/fixture",
  };

  it("retains artist validation for a recording named after its artist", () => {
    expect(
      isTrackSearchFallbackMatch(
        { title: "Black Sabbath", artist: "Black Sabbath", artists: ["Black Sabbath"], durationMs: 300000 },
        unrelated,
      ),
    ).toBe(false);
  });

  it("retains the separate unstructured search marker", () => {
    expect(isTrackSearchFallbackMatch({ title: "Black Sabbath", artist: "Black Sabbath" }, unrelated)).toBe(true);
  });
});
