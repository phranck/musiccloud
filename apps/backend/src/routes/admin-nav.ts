import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";

import { getManagedNavItems, isValidNavId, replaceManagedNavItems } from "../services/admin-nav.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export default async function adminNavRoutes(app: FastifyInstance) {
  // GET /api/admin/nav/:navId
  app.get<{ Params: { navId: string } }>(ROUTE_TEMPLATES.admin.navigations.detail, async (request, reply) => {
    const { navId } = request.params;
    if (!isValidNavId(navId)) {
      return reply.status(400).send({ error: "INVALID_INPUT", message: 'navId must be "header" or "footer"' });
    }
    return getManagedNavItems(navId);
  });

  // PUT /api/admin/nav/:navId
  app.put<{ Params: { navId: string } }>(ROUTE_TEMPLATES.admin.navigations.detail, async (request, reply) => {
    const { navId } = request.params;
    if (!isValidNavId(navId)) {
      return reply.status(400).send({ error: "INVALID_INPUT", message: 'navId must be "header" or "footer"' });
    }
    if (!isPlainObject(request.body)) {
      return reply.status(400).send({ error: "INVALID_INPUT", message: "body must be { items: [...] }" });
    }
    const result = await replaceManagedNavItems(navId, request.body.items);
    if (!result.ok) return reply.status(400).send({ error: result.code, message: result.message });
    return result.data;
  });
}
