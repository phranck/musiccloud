import { ENDPOINTS, isValidServiceId, type PluginInfo, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { upsertPluginState } from "../db/plugin-repository.js";
import type { ServicePlugin } from "../services/plugins/manifest.js";
import { getEnabledMap, invalidateEnabledCache, listPlugins } from "../services/plugins/registry.js";

function collectMissingEnv(required: readonly string[] = []): string[] {
  return required.filter((key) => !process.env[key]);
}

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

/** Admin-protected endpoints for managing resolve plugins. */
export default async function adminPluginsRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.admin.plugins.list, async () => {
    return buildPluginInfoList();
  });

  app.patch<{ Params: { id: string }; Body: { enabled?: unknown } }>(
    ROUTE_TEMPLATES.admin.plugins.detail,
    async (request, reply) => {
      const { id } = request.params;
      if (!isValidServiceId(id)) {
        return reply.status(400).send({ error: "INVALID_ID", message: `Unknown plugin id: ${id}` });
      }

      const enabled = request.body?.enabled;
      if (typeof enabled !== "boolean") {
        return reply.status(400).send({ error: "INVALID_BODY", message: "Body must be { enabled: boolean }." });
      }

      // Ensure the plugin actually exists in the registry (isValidServiceId
      // only checks the ServiceId union; a valid id may still not be
      // installed as a plugin).
      const plugin = listPlugins().find((p) => p.manifest.id === id);
      if (!plugin) {
        return reply.status(404).send({ error: "NOT_FOUND", message: `Plugin not installed: ${id}` });
      }

      await upsertPluginState(id, enabled);
      invalidateEnabledCache();

      const list = await buildPluginInfoList();
      const updated = list.find((p) => p.id === id);
      return updated;
    },
  );
}
