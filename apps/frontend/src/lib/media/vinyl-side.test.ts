import type { VinylLayout } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { sideForTrackTitle } from "./vinyl-side.js";

const theSermonLayout: VinylLayout = {
  discogsReleaseId: "10013707",
  sides: [
    {
      label: "A",
      tracks: [{ position: "A", title: "The Sermon", durationMs: 1_210_000 }],
    },
    {
      label: "B",
      tracks: [
        { position: "B1", title: "J.O.S.", durationMs: 714_000 },
        { position: "B2", title: "Flamingo", durationMs: 480_000 },
      ],
    },
  ],
};

describe("sideForTrackTitle", () => {
  it("returns the side containing a matching track title", () => {
    expect(sideForTrackTitle(theSermonLayout, "The Sermon")?.label).toBe("A");
    expect(sideForTrackTitle(theSermonLayout, "J.O.S.")?.label).toBe("B");
  });

  it("normalizes case and surrounding whitespace before matching", () => {
    expect(sideForTrackTitle(theSermonLayout, "  the sermon ")?.label).toBe("A");
  });

  it("returns null when no matching track or layout is available", () => {
    expect(sideForTrackTitle(theSermonLayout, "Unknown track")).toBeNull();
    expect(sideForTrackTitle(null, "The Sermon")).toBeNull();
    expect(sideForTrackTitle(undefined, "The Sermon")).toBeNull();
    expect(sideForTrackTitle(theSermonLayout, null)).toBeNull();
  });
});
