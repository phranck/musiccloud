import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";

import { getPublicContentPage, getPublicContentPages } from "../services/admin-content.js";
import { getPublicNavItems, isValidNavId } from "../services/admin-nav.js";

const NAV_CACHE = "public, max-age=300, stale-while-revalidate=3600";
const CONTENT_CACHE = "public, max-age=3600, stale-while-revalidate=86400";

/**
 * Public-read endpoints for navigation and content pages. No auth required —
 * these feed the Astro frontend at SSR time. Cache headers are tuned for
 * CDN-friendliness: nav refreshes every 5 minutes, content pages every hour.
 */
export default async function publicContentNavRoutes(app: FastifyInstance) {
  app.get<{ Params: { navId: string } }>(ROUTE_TEMPLATES.v1.nav, async (request, reply) => {
    const { navId } = request.params;
    if (!isValidNavId(navId)) {
      return reply.status(400).send({ error: "INVALID_INPUT", message: 'navId must be "header" or "footer"' });
    }
    reply.header("Cache-Control", NAV_CACHE);
    return getPublicNavItems(navId);
  });

  app.get(ENDPOINTS.v1.content.list, async (_request, reply) => {
    reply.header("Cache-Control", CONTENT_CACHE);
    return getPublicContentPages();
  });

  app.get<{ Params: { slug: string } }>(ROUTE_TEMPLATES.v1.contentDetail, async (request, reply) => {
    const page = await getPublicContentPage(request.params.slug);
    if (!page) return reply.status(404).send({ error: "NOT_FOUND", message: "Content page not found" });
    reply.header("Cache-Control", CONTENT_CACHE);
    return page;
  });
}
