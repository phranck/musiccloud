import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { inlineBlockHash } from "@musiccloud/shared/node";
import { describe, expect, it } from "vitest";
import {
  DAYNESS_SEED_SCRIPT,
  SHARE_LOADING_TIMEOUT_SCRIPT,
  SHARE_MEDIA_VIEW_SCRIPT,
  SHARE_REDIRECT_SCRIPT,
  SITE_INLINE_SCRIPT_HASHES,
} from "./inline-scripts";

/** Every `.astro` file of the site, recursively. */
function astroFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return astroFiles(path);
    return entry.endsWith(".astro") ? [path] : [];
  });
}

/** The scripts in this module, by the name a page imports them under. */
const SCRIPTS = {
  DAYNESS_SEED_SCRIPT,
  SHARE_REDIRECT_SCRIPT,
  SHARE_MEDIA_VIEW_SCRIPT,
  SHARE_LOADING_TIMEOUT_SCRIPT,
};

describe("the site's inline scripts", () => {
  it("are all named by the content policy", () => {
    expect(SITE_INLINE_SCRIPT_HASHES).toEqual(Object.values(SCRIPTS).map(inlineBlockHash));
  });

  /**
   * The site enforces its script policy, so an inline script a page writes
   * that this module does not hold is refused by the browser. JSON blocks do
   * not run, and a script with `src` loads from the site itself.
   */
  it("are the only inline scripts the pages write", () => {
    const sourceRoot = join(import.meta.dirname, "..");
    const written = astroFiles(sourceRoot).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/<script\b[^>]*\bis:inline\b[^>]*>/g)]
        .map((match) => match[0])
        .filter((tag) => !/\bsrc=/.test(tag) && !/type="application\/(ld\+)?json"/.test(tag))
        .map((tag) => `${file.slice(sourceRoot.length + 1)}: ${tag}`),
    );

    for (const tag of written) {
      const constant = tag.match(/set:html=\{(\w+)\}/)?.[1];
      expect(constant && constant in SCRIPTS, tag).toBe(true);
    }
    expect(written.length).toBeGreaterThan(0);
  });
});
