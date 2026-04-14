import { type ActiveService, ENDPOINTS, PLATFORM_CONFIG } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getActiveAdapters } from "../services/plugins/registry.js";

/**
 * Public (no-auth) endpoint exposing the active-services list for SSR in
 * the Astro frontend (marquee, resolve/embed pages). Trimmed to the
 * minimum the public site needs: id, displayName, color.
 *
 * Backed by the registry's 30s enabled-map cache, so toggling a plugin
 * off propagates here within one TTL.
 */
export default async function servicesPublicRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.v1.services.active, async (_request, reply) => {
    const adapters = await getActiveAdapters();
    const services: ActiveService[] = adapters.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      color: PLATFORM_CONFIG[a.id]?.color ?? "#ffffff",
    }));
    reply.header("Cache-Control", "public, max-age=30");
    return services;
  });
}
