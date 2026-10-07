/** Vite cache that only `astro dev` uses, relative to the app's root. */
const DEV_SERVER_CACHE_DIR = "node_modules/.vite-dev";

/** Vite's own default cache, left to every other Astro command. */
const COMMAND_CACHE_DIR = "node_modules/.vite";

/**
 * Picks the Vite cache directory for an Astro app from the command it runs.
 *
 * `astro build` and `astro check` both run Vite's dependency optimizer and
 * write its result into the cache. A running `astro dev` serves its optimized
 * modules from that cache, so with one shared directory every build or type
 * check replaces them, the dev server answers each dependency it optimized at
 * runtime with `504 (Outdated Optimize Dep)`, and its pages stop hydrating
 * until it restarts. Only the dev server gets a cache of its own, so no other
 * command can reach it. Astro does not hand the command to its config, so this
 * reads the CLI arguments it was started with.
 *
 * @param {readonly string[]} [argv] - The process arguments. Defaults to `process.argv`.
 * @returns {string} The cache directory for `cacheDir` in the app's Vite config.
 */
export function astroViteCacheDir(argv = process.argv) {
  return argv.includes("dev") ? DEV_SERVER_CACHE_DIR : COMMAND_CACHE_DIR;
}
