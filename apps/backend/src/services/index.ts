/**
 * Thin re-export layer over the plugin registry. The actual adapter list,
 * enabled-state cache, and URL identification live in
 * `services/plugins/registry.ts`. Consumers should import from here to
 * keep their import paths short and stable.
 */
import { log } from "../lib/infra/logger.js";
import { listPlugins } from "./plugins/registry.js";

export {
  filterDisabledLinks,
  getActiveAdapters,
  getEnabledMap,
  identifyService,
  identifyServiceIncludingDisabled,
  invalidateEnabledCache,
  isPluginEnabled,
  listPlugins,
} from "./plugins/registry.js";

/**
 * Sanity-check that every plugin's adapter.id matches its manifest.id.
 * Mismatches here mean a plugin barrel was wired up with the wrong
 * adapter and resolves against it will silently drop those URLs.
 */
export function validateAdapters(): void {
  for (const plugin of listPlugins()) {
    if (!plugin.adapter) {
      log.error(
        "Services",
        `Plugin ${plugin.manifest.id} has no adapter. Check plugins/${plugin.manifest.id}/index.ts`,
      );
      continue;
    }
    if (plugin.adapter.id !== plugin.manifest.id) {
      log.error("Services", `Plugin ${plugin.manifest.id} has mismatched adapter.id=${plugin.adapter.id}`);
    }
  }
}
