/**
 * @file Unauthenticated endpoint that lists the currently active services.
 *
 * Consumed by the Astro frontend during SSR for the marquee and the
 * resolve/embed pages. The response intentionally exposes only `id`,
 * `displayName`, and `color`: the public site never needs adapter-level
 * detail such as `capabilities`, auth requirements, or rate limits, and
 * leaking that surface would be both noisy and a soft information leak
 * about which services currently hold credentials.
 *
 * Cache behavior: backed by the registry's 30-second enabled-map cache AND
 * a matching `Cache-Control: public, max-age=30`. Toggling a plugin off in
 * the admin UI therefore propagates to visitors within one TTL; same-second
 * propagation would require a cache bust, which is a conscious non-goal.
 *
 * The `#ffffff` fallback on `color` guards against a newly-added adapter
 * whose `PLATFORM_CONFIG` entry has not yet shipped: it stays visible in
 * the marquee with a neutral default instead of crashing the SSR render.
 */
import { type ActiveService, ENDPOINTS, PLATFORM_CONFIG } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getActiveAdapters } from "../services/plugins/registry.js";

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
