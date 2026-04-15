/**
 * @file Admin endpoints for inspecting and toggling resolve plugins.
 *
 * Registered inside the admin scope in `server.ts`, so every request has
 * passed `authenticateAdmin` (Bearer JWT with `role: "admin"`) before this
 * handler runs.
 *
 * The shape of `PluginInfo` surfaces four distinct states that the admin
 * UI needs to distinguish, and which are easy to confuse:
 *
 * - `enabled` - the admin toggled this plugin on in the DB (`plugin_state`).
 * - `available` - the adapter itself reports it can serve traffic right now
 *   (credentials present, keyless services always return `true`).
 * - `requiredEnv` - the set of env vars declared as prerequisites in the
 *   plugin's manifest.
 * - `missingEnv` - the subset of `requiredEnv` not currently set in
 *   `process.env`.
 *
 * A plugin can be enabled-but-not-available (config missing at runtime) or
 * available-but-not-enabled (admin has it switched off); the UI needs both
 * flags to show an accurate status. Without `missingEnv`, an operator
 * could not tell *why* `available` is false for a credentialed service.
 */
import { ENDPOINTS, isValidServiceId, type PluginInfo, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { upsertPluginState } from "../db/plugin-repository.js";
import type { ServicePlugin } from "../services/plugins/manifest.js";
import { getEnabledMap, invalidateEnabledCache, listPlugins } from "../services/plugins/registry.js";

/**
 * @param required - list of env var names the plugin's manifest requires
 * @returns the subset of `required` whose env vars are currently unset
 */
function collectMissingEnv(required: readonly string[] = []): string[] {
  return required.filter((key) => !process.env[key]);
}

/**
 * Builds the combined admin-facing view of every installed plugin: manifest
 * metadata, live adapter capabilities, and the cached enabled state. Pulled
 * out into a helper because both the list GET and the patch response use
 * the same shape (the PATCH returns the single affected entry so the UI
 * can update its row without re-fetching the whole list).
 *
 * @returns a `PluginInfo` for every plugin `listPlugins()` currently knows about
 */
async function buildPluginInfoList(): Promise<PluginInfo[]> {
  const enabled = await getEnabledMap();
  return listPlugins().map((plugin: ServicePlugin) => {
    const { manifest, adapter } = plugin;
    const requiredEnv = manifest.requiredEnv ?? [];
    return {
      id: manifest.id,
      displayName: manifest.displayName,
      description: manifest.description,
      enabled: enabled.get(manifest.id) === true,
      available: adapter.isAvailable(),
      requiredEnv,
      missingEnv: collectMissingEnv(requiredEnv),
      capabilities: {
        supportsIsrc: adapter.capabilities.supportsIsrc,
        supportsPreview: adapter.capabilities.supportsPreview,
        supportsArtwork: adapter.capabilities.supportsArtwork,
      },
      hasAlbumSupport: Boolean(adapter.albumCapabilities),
      hasArtistSupport: Boolean(adapter.artistCapabilities),
      defaultEnabled: manifest.defaultEnabled,
      docsUrl: manifest.docsUrl,
    };
  });
}

export default async function adminPluginsRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.admin.plugins.list, async () => {
    return buildPluginInfoList();
  });

  app.patch<{ Params: { id: string }; Body: { enabled?: unknown } }>(
    ROUTE_TEMPLATES.admin.plugins.detail,
    async (request, reply) => {
      const { id } = request.params;
      // Two-stage validation. `isValidServiceId` checks the compile-time
      // `ServiceId` union (catches typos and stale URLs), but that union
      // can still contain ids for plugins that are not currently installed
      // as a registry entry. The `listPlugins` lookup below catches that.
      if (!isValidServiceId(id)) {
        return reply.status(400).send({ error: "INVALID_ID", message: `Unknown plugin id: ${id}` });
      }

      const enabled = request.body?.enabled;
      if (typeof enabled !== "boolean") {
        return reply.status(400).send({ error: "INVALID_BODY", message: "Body must be { enabled: boolean }." });
      }

      const plugin = listPlugins().find((p) => p.manifest.id === id);
      if (!plugin) {
        return reply.status(404).send({ error: "NOT_FOUND", message: `Plugin not installed: ${id}` });
      }

      await upsertPluginState(id, enabled);
      // The registry caches the enabled map (used by adapter selection on
      // every resolve). Without an explicit bust, a toggle made here would
      // only take effect after the TTL expires, which makes the admin UI
      // feel broken ("I clicked off, it still resolves").
      invalidateEnabledCache();

      // Returning the single updated entry lets the admin UI patch its row
      // in place instead of re-fetching the whole list.
      const list = await buildPluginInfoList();
      const updated = list.find((p) => p.id === id);
      return updated;
    },
  );
}
