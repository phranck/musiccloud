import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** The repository root, from this file in `packages/shared/src/__tests__`. */
export const REPOSITORY_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

/** The source folders of the four web apps. */
const APP_SOURCE_DIRECTORIES = ["apps/backend/src", "apps/frontend/src", "apps/developer/src", "apps/dashboard/src"];

/** The Astro configs, which sit beside `src` and name their app's own address. */
const ASTRO_CONFIGS = ["apps/frontend/astro.config.mjs", "apps/developer/astro.config.mjs"];

/** Folders that hold no shipped source: dependencies, build output and test helpers. */
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "__tests__"]);

const SOURCE_FILE = /\.(ts|tsx|astro|mjs)$/;
const TEST_FILE = /\.test\.(ts|tsx)$/;

/** Every source file below a folder, recursively, as absolute paths. */
function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return SKIPPED_DIRECTORIES.has(entry) ? [] : sourceFilesUnder(path);
    return SOURCE_FILE.test(entry) && !TEST_FILE.test(entry) ? [path] : [];
  });
}

/**
 * Every source file the web apps and the packages ship, for tests that ask
 * where a value is written.
 *
 * Covers the four apps' `src` folders, the `src` folder of every package that
 * has one, and the two Astro configs. Tests and their helpers are left out,
 * because a test names the values it checks against, and that is not a second
 * place the value is decided.
 *
 * @returns Paths relative to the repository root, such as
 *   `packages/shared/src/security-headers.ts`.
 */
export function shippedSourceFiles(): string[] {
  const packageSources = readdirSync(join(REPOSITORY_ROOT, "packages"))
    .map((name) => join("packages", name, "src"))
    .filter((directory) => existsSync(join(REPOSITORY_ROOT, directory)));

  return [...APP_SOURCE_DIRECTORIES, ...packageSources]
    .flatMap((directory) => sourceFilesUnder(join(REPOSITORY_ROOT, directory)))
    .map((path) => relative(REPOSITORY_ROOT, path))
    .concat(ASTRO_CONFIGS);
}
