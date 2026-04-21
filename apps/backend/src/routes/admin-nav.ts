import { isLocale, ROUTE_TEMPLATES } from "@musiccloud/shared";
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
    const items = request.body.items;
    if (Array.isArray(items)) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!isPlainObject(item)) continue;
        const raw = item as Record<string, unknown>;
        if (raw.translations !== undefined) {
          if (!isPlainObject(raw.translations)) {
            return reply
              .status(400)
              .send({ error: "INVALID_INPUT", message: `items[${i}].translations must be a plain object` });
          }
          for (const [key, val] of Object.entries(raw.translations)) {
            if (!isLocale(key)) {
              return reply
                .status(400)
                .send({ error: "INVALID_INPUT", message: `items[${i}].translations: unknown locale '${key}'` });
            }
            if (typeof val !== "string" || val.length === 0) {
              return reply.status(400).send({
                error: "INVALID_INPUT",
                message: `items[${i}].translations: values must be non-empty strings`,
              });
            }
          }
        }
      }
    }
    const result = await replaceManagedNavItems(navId, items);
    if (!result.ok) return reply.status(400).send({ error: result.code, message: result.message });
    return result.data;
  });
}
