import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { isGenreTag, pickLastFmImage } from "../lastfm-response.js";

/** The backend source root, from this file's directory. */
const BACKEND_SOURCE = join(import.meta.dirname, "../../../..");

/** Every TypeScript file below `directory`. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

describe("the Last.fm client", () => {
  it("is the only place that names the Last.fm endpoint", () => {
    // Built at runtime, so this file does not name the endpoint itself.
    const endpoint = ["ws", "audioscrobbler", "com"].join(".");
    const naming = sourceFiles(BACKEND_SOURCE)
      .filter((path) => readFileSync(path, "utf8").includes(endpoint))
      .map((path) => relative(BACKEND_SOURCE, path));

    expect(naming).toEqual(["services/plugins/lastfm/lastfm-response.ts"]);
  });
});

describe("pickLastFmImage", () => {
  it("takes the extra-large picture, else the last one", () => {
    expect(
      pickLastFmImage([
        { size: "small", "#text": "https://img/small.jpg" },
        { size: "extralarge", "#text": "https://img/xl.jpg" },
        { size: "mega", "#text": "https://img/mega.jpg" },
      ]),
    ).toBe("https://img/xl.jpg");
    expect(pickLastFmImage([{ size: "large", "#text": "https://img/large.jpg" }])).toBe("https://img/large.jpg");
  });

  it("returns null for Last.fm's placeholder and for no picture", () => {
    expect(
      pickLastFmImage([{ size: "extralarge", "#text": "https://img/2a96cbd8b46e442fc41c2b86b821562f.png" }]),
    ).toBeNull();
    expect(pickLastFmImage([])).toBeNull();
    expect(pickLastFmImage(undefined)).toBeNull();
  });
});

describe("isGenreTag", () => {
  it("refuses the tags both former lists refused", () => {
    for (const tag of ["seen live", "spotify", "soundtrack", "best", "british", "female vocalists", "instrumental"]) {
      expect(isGenreTag(tag)).toBe(false);
    }
  });

  it("accepts a genre in any case and spacing", () => {
    expect(isGenreTag("  Shoegaze ")).toBe(true);
  });

  it("refuses years and decades unless the caller keeps them", () => {
    expect(isGenreTag("80s")).toBe(false);
    expect(isGenreTag("1995")).toBe(false);
    expect(isGenreTag("80s", { keepDates: true })).toBe(true);
    expect(isGenreTag("british", { keepDates: true })).toBe(false);
  });
});
