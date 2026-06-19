import { describe, expect, it } from "vitest";
import { compareByDisplayOrder, SERVICE_DISPLAY_ORDER } from "../platform.js";

describe("compareByDisplayOrder", () => {
  it("orders services by SERVICE_DISPLAY_ORDER, major services first", () => {
    const shuffled = ["jiosaavn", "spotify", "deezer", "apple-music"];
    expect([...shuffled].sort(compareByDisplayOrder)).toEqual(["spotify", "apple-music", "deezer", "jiosaavn"]);
  });

  it("ranks a major service ahead of a regional one", () => {
    expect(compareByDisplayOrder("spotify", "melon")).toBeLessThan(0);
  });

  it("sends unknown services to the end", () => {
    expect(["unknown-service", "spotify"].sort(compareByDisplayOrder)).toEqual(["spotify", "unknown-service"]);
  });

  it("leads the display order with the major streaming services", () => {
    expect(SERVICE_DISPLAY_ORDER.slice(0, 3)).toEqual(["spotify", "apple-music", "youtube"]);
  });
});
