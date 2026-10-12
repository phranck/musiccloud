import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every adapter reads a search query and scores an album through
 * `_shared/confidence.ts`. An adapter that decodes the free-text mark itself
 * or scores albums with its own arguments is how album matches came to ignore
 * the year on one service and the track count on another.
 */

/** The plugins directory, from this file's directory. */
const PLUGINS = join(import.meta.dirname, "../..");

/** Every adapter source file, the shared helpers and the tests left out. */
function adapterFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === "__tests__" || entry === "_shared" ? [] : adapterFiles(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

/** The adapter files whose source matches `pattern`, relative to the plugins directory. */
function filesMatching(pattern: RegExp): string[] {
  return adapterFiles(PLUGINS)
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(PLUGINS, path));
}

describe("adapter scoring", () => {
  it("leaves album scoring to scoreAlbumCandidate", () => {
    expect(filesMatching(/\bcalculateAlbumConfidence\b/)).toEqual([]);
  });

  it("leaves the free-text mark to isFreeTextSearch and searchText", () => {
    expect(filesMatching(/title === query\.artist/)).toEqual([]);
  });
});
