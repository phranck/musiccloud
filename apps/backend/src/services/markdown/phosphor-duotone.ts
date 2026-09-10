/**
 * @file The duotone shape of one Phosphor icon, read from disk.
 *
 * The whole set is 5.9 MB across 1512 icons and a page names a handful, so the
 * assets sit beside the built bundle as files and one is read the first time a
 * page asks for it. `scripts/copy-phosphor-icons.mjs` is what puts them there.
 *
 * Names that lead nowhere are remembered as absent, so a typo in a page is not
 * looked up again on every render.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * One of the two shapes an icon is drawn from.
 *
 * @property d - The path itself.
 * @property opacity - Set on the shape carrying the second tone, absent on the
 *   one drawn at full strength.
 */
export interface DuotonePath {
  d: string;
  opacity?: string;
}

/**
 * Where the assets sit, in the order they are looked for.
 *
 * `__dirname` is `apps/backend/dist` once tsup has bundled the source, and the
 * copy sits beside it there. That is the deployed arrangement, and it is first
 * because in production it is the only one that exists.
 *
 * Running from the source, as the tests and the watcher do, the package itself
 * is still installed, so the assets are read out of it and nothing has to be
 * built first.
 */
const ASSET_DIRECTORIES = [
  path.join(__dirname, "icons", "duotone"),
  path.join(__dirname, "..", "..", "..", "node_modules", "@phosphor-icons", "core", "assets", "duotone"),
];

const ASSET_DIRECTORY = ASSET_DIRECTORIES.find((candidate) => existsSync(candidate)) ?? ASSET_DIRECTORIES[0];

/** What a Phosphor name may look like, which is also what keeps it a file name. */
const ICON_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** One `<path>` in an asset, with its `d` and its optional `opacity`. */
const PATH_ELEMENT = /<path\b[^>]*>/g;
const PATH_D = /\bd="([^"]*)"/;
const PATH_OPACITY = /\bopacity="([^"]*)"/;

/** What has already been read, absences included. */
const cache = new Map<string, DuotonePath[] | null>();

/**
 * Reads the two shapes out of one asset.
 *
 * A regular expression rather than an XML parser, because the assets are
 * generated and every one of them is a single `<svg>` holding nothing but
 * `<path>` elements.
 *
 * @param svg - The file's contents.
 * @returns The shapes, in the order they are drawn.
 */
function readPaths(svg: string): DuotonePath[] {
  const paths: DuotonePath[] = [];
  for (const element of svg.matchAll(PATH_ELEMENT)) {
    const d = element[0].match(PATH_D)?.[1];
    if (!d) continue;
    const opacity = element[0].match(PATH_OPACITY)?.[1];
    paths.push(opacity ? { d, opacity } : { d });
  }
  return paths;
}

/**
 * The duotone shapes of one icon.
 *
 * @param name - The icon in the spelling Phosphor publishes, so `x-circle`.
 * @returns The shapes, or `null` when there is no such icon. A page naming one
 *   keeps its shortcode standing as text, so whoever wrote it sees that the
 *   name is wrong rather than an empty space.
 */
export function duotonePaths(name: string): DuotonePath[] | null {
  const trimmed = name.trim().toLowerCase();
  const cached = cache.get(trimmed);
  if (cached !== undefined) return cached;

  // Checked before it reaches a path, because the name comes from a page. The
  // pattern admits no dot and no separator, so nothing here can leave the
  // directory.
  if (!ICON_NAME_PATTERN.test(trimmed)) {
    cache.set(trimmed, null);
    return null;
  }

  try {
    const svg = readFileSync(path.join(ASSET_DIRECTORY, `${trimmed}-duotone.svg`), "utf8");
    const paths = readPaths(svg);
    const result = paths.length > 0 ? paths : null;
    cache.set(trimmed, result);
    return result;
  } catch {
    cache.set(trimmed, null);
    return null;
  }
}

/**
 * Forgets what has been read.
 *
 * Exported for the tests, which need a cold cache to see a name being looked
 * up rather than remembered.
 */
export function resetDuotoneCache(): void {
  cache.clear();
}
