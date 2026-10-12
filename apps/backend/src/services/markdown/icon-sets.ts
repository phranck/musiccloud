/**
 * @file The shapes of one icon, read from disk.
 *
 * Two sets, because the two surfaces are drawn in different hands. The
 * developer portal is Iconsax, in its Bulk style, which is a decision about how
 * that product looks. The site is Phosphor, in duotone. A shortcode draws from
 * whichever set belongs to the surface it is rendering for, so a page never has
 * to know and a symbol never arrives in the wrong hand.
 *
 * The names therefore differ between the two, because the sets publish
 * different ones. A page written for one surface and published on the other may
 * name an icon the other has no word for, and the renderer leaves the shortcode
 * standing as text where that happens, which is what makes it visible.
 *
 * Both sets sit beside the built bundle as files: together they are 6 MB across
 * 2500 icons, and a page names a handful, so one is read the first time a page
 * asks for it. `scripts/copy-phosphor-icons.mjs` and
 * `scripts/build-iconsax-bulk.mjs` are what put them there.
 *
 * Names that lead nowhere are remembered as absent, so a typo in a page is not
 * looked up again on every render.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * One shape an icon is drawn from.
 *
 * @property d - The path itself.
 * @property opacity - Set on a shape carrying a lighter tone, absent on one
 *   drawn at full strength. Both sets use this for their second tone.
 */
export interface IconPath {
  d: string;
  opacity?: string;
}

/** Which hand an icon is drawn in. */
export const IconSet = {
  /** The developer portal, in Iconsax Bulk. */
  IconsaxBulk: "iconsax-bulk",
  /** The site, in Phosphor duotone. */
  PhosphorDuotone: "duotone",
} as const;

/** One of the sets in {@link IconSet}. */
export type IconSetValue = (typeof IconSet)[keyof typeof IconSet];

/**
 * The box each set draws in, which the renderer writes onto the `<svg>`.
 *
 * They differ, and a shape drawn against the wrong box is the wrong size and in
 * the wrong place, so this is read from the set rather than assumed.
 */
export const ICON_VIEW_BOX: Record<IconSetValue, string> = {
  [IconSet.IconsaxBulk]: "0 0 24 24",
  [IconSet.PhosphorDuotone]: "0 0 256 256",
};

/** `apps/backend`, seen from this file's directory in the source tree. */
const SOURCE_BACKEND_ROOT = path.join(__dirname, "..", "..", "..");

/**
 * Where a set's assets sit when running from the source rather than from the
 * bundle, which is how the tests run.
 *
 * Never `dist`, because the dev watcher empties and refills it on every
 * rebuild, and a test reading it at that moment finds an icon missing.
 * Phosphor's own package holds its assets as files. Iconsax ships components
 * rather than assets, so the backend's test scripts extract its shapes into a
 * cache directory of their own, `node_modules/.cache/icons/iconsax-bulk`, which
 * they pass to `scripts/build-iconsax-bulk.mjs` in `package.json`.
 */
const SOURCE_ASSET_DIRECTORY: Record<IconSetValue, string> = {
  [IconSet.IconsaxBulk]: path.join(SOURCE_BACKEND_ROOT, "node_modules", ".cache", "icons", "iconsax-bulk"),
  [IconSet.PhosphorDuotone]: path.join(
    SOURCE_BACKEND_ROOT,
    "node_modules",
    "@phosphor-icons",
    "core",
    "assets",
    "duotone",
  ),
};

/**
 * Where one set's assets sit.
 *
 * `__dirname` is `apps/backend/dist` once tsup has bundled the source, and both
 * sets sit beside it there. That is the deployed arrangement, and the only one
 * that exists in production. Running from the source, `__dirname` is the
 * directory this file lives in, and {@link SOURCE_ASSET_DIRECTORY} names where
 * each set is read from instead.
 *
 * @param set - Which hand to look for.
 * @returns The directory to read from.
 */
export function iconAssetDirectory(set: IconSetValue): string {
  const besideBundle = path.join(__dirname, "icons", set);
  return existsSync(besideBundle) ? besideBundle : SOURCE_ASSET_DIRECTORY[set];
}

/** What a Phosphor name may look like, which is also what keeps it a file name. */
const ICON_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** One `<path>` in an asset, with its `d` and its optional `opacity`. */
const PATH_ELEMENT = /<path\b[^>]*>/g;
const PATH_D = /\bd="([^"]*)"/;
const PATH_OPACITY = /\bopacity="([^"]*)"/;

/** What has already been read, per set, absences included. */
const cache = new Map<string, IconPath[] | null>();

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
function readPaths(svg: string): IconPath[] {
  const paths: IconPath[] = [];
  for (const element of svg.matchAll(PATH_ELEMENT)) {
    const d = element[0].match(PATH_D)?.[1];
    if (!d) continue;
    const opacity = element[0].match(PATH_OPACITY)?.[1];
    paths.push(opacity ? { d, opacity } : { d });
  }
  return paths;
}

/**
 * What one set calls the file an icon lives in.
 *
 * Phosphor names its assets by weight, so the duotone `key` is `key-duotone`.
 * The Iconsax set is built here and names each file after the icon alone.
 *
 * @param set - Which hand.
 * @param name - The icon in the spelling that set publishes.
 * @returns The file's name.
 */
function fileNameFor(set: IconSetValue, name: string): string {
  return set === IconSet.PhosphorDuotone ? `${name}-duotone.svg` : `${name}.svg`;
}

/**
 * The shapes of one icon.
 *
 * @param set - Which hand to draw it in.
 * @param name - The icon in the spelling that set publishes, so `x-circle` for
 *   Phosphor and `profile-circle` for Iconsax.
 * @returns The shapes, or `null` when that set has no such icon. A page naming
 *   one keeps its shortcode standing as text, so whoever wrote it sees that the
 *   name is wrong rather than an empty space.
 */
export function iconPaths(set: IconSetValue, name: string): IconPath[] | null {
  const trimmed = name.trim().toLowerCase();
  const key = `${set}/${trimmed}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  // Checked before it reaches a path, because the name comes from a page. The
  // pattern admits no dot and no separator, so nothing here can leave the
  // directory.
  if (!ICON_NAME_PATTERN.test(trimmed)) {
    cache.set(key, null);
    return null;
  }

  try {
    const svg = readFileSync(path.join(iconAssetDirectory(set), fileNameFor(set, trimmed)), "utf8");
    const paths = readPaths(svg);
    const result = paths.length > 0 ? paths : null;
    cache.set(key, result);
    return result;
  } catch {
    cache.set(key, null);
    return null;
  }
}

/**
 * Forgets what has been read.
 *
 * Exported for the tests, which need a cold cache to see a name being looked
 * up rather than remembered.
 */
export function resetIconCache(): void {
  cache.clear();
}
