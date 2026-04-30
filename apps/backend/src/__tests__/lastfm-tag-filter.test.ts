import { describe, expect, it } from "vitest";

import { filterLastFmTags } from "../services/plugins/lastfm/artist-top-tags";

describe("filterLastFmTags", () => {
  it("strips 'seen live' marker tag", () => {
    const out = filterLastFmTags([{ name: "alternative" }, { name: "seen live" }, { name: "rock" }]);
    expect(out).toEqual(["alternative", "rock"]);
  });

  it("strips year tags (1990s/2000s/2010s)", () => {
    const out = filterLastFmTags([{ name: "1995" }, { name: "2010" }, { name: "indie" }]);
    expect(out).toEqual(["indie"]);
  });

  it("strips decade tags ('80s', '90s', '00s')", () => {
    const out = filterLastFmTags([{ name: "80s" }, { name: "90s" }, { name: "synth-pop" }]);
    expect(out).toEqual(["synth-pop"]);
  });

  it("strips meta-list tags (favorite/love/best/all)", () => {
    const out = filterLastFmTags([{ name: "favorite" }, { name: "all" }, { name: "love" }, { name: "ambient" }]);
    expect(out).toEqual(["ambient"]);
  });

  it("caps result at 3 tags", () => {
    const out = filterLastFmTags([{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }, { name: "e" }]);
    expect(out).toEqual(["a", "b", "c"]);
  });

  it("returns empty array on empty input", () => {
    expect(filterLastFmTags([])).toEqual([]);
  });

  it("normalises case and trims whitespace", () => {
    const out = filterLastFmTags([{ name: "  Indie Rock  " }, { name: "ROCK" }]);
    expect(out).toEqual(["indie rock", "rock"]);
  });
});
