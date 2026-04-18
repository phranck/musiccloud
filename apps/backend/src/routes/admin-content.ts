import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  createManagedContentPage,
  deleteManagedContentPage,
  getManagedContentPage,
  getManagedContentPages,
  updateManagedContentPageBody,
  updateManagedContentPageMeta,
} from "../services/admin-content.js";

function getCallerId(request: FastifyRequest): string | null {
  const payload = request.user as { sub?: string } | undefined;
  return payload?.sub ?? null;
}

function statusCodeForError(code: "NOT_FOUND" | "SLUG_TAKEN" | "INVALID_INPUT"): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "SLUG_TAKEN":
      return 409;
    case "INVALID_INPUT":
      return 400;
  }
}

interface ContentCreateBody {
  slug: string;
  title: string;
  status?: "draft" | "published" | "hidden";
}

interface ContentMetaBody {
  title?: string;
  slug?: string;
  status?: "draft" | "published" | "hidden";
  showTitle?: boolean;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function validateCreateBody(body: unknown): ContentCreateBody | string {
  if (!isPlainObject(body)) return "body must be an object";
  if (typeof body.slug !== "string") return "slug must be string";
  if (typeof body.title !== "string") return "title must be string";
  const out: ContentCreateBody = { slug: body.slug, title: body.title };
  if (body.status !== undefined) {
    if (body.status !== "draft" && body.status !== "published" && body.status !== "hidden") {
      return "status must be draft, published, or hidden";
    }
    out.status = body.status;
  }
  return out;
}

function validateMetaBody(body: unknown): ContentMetaBody | string {
  if (!isPlainObject(body)) return "body must be an object";
  const out: ContentMetaBody = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string") return "title must be string";
    out.title = body.title;
  }
  if (body.slug !== undefined) {
    if (typeof body.slug !== "string") return "slug must be string";
    out.slug = body.slug;
  }
  if (body.status !== undefined) {
    if (body.status !== "draft" && body.status !== "published" && body.status !== "hidden") {
      return "status must be draft, published, or hidden";
    }
    out.status = body.status;
  }
  if (body.showTitle !== undefined) {
    if (typeof body.showTitle !== "boolean") return "showTitle must be boolean";
    out.showTitle = body.showTitle;
  }
  return out;
}

export default async function adminContentRoutes(app: FastifyInstance) {
  // GET /api/admin/pages
  app.get(ENDPOINTS.admin.pages.list, async () => {
    return getManagedContentPages();
  });

  // POST /api/admin/pages
  app.post(ENDPOINTS.admin.pages.list, async (request, reply) => {
    const validated = validateCreateBody(request.body);
    if (typeof validated === "string") {
      return reply.status(400).send({ error: "INVALID_INPUT", message: validated });
    }
    const result = await createManagedContentPage({ ...validated, createdBy: getCallerId(request) });
    if (!result.ok)
      return reply.status(statusCodeForError(result.code)).send({ error: result.code, message: result.message });
    return reply.status(201).send(result.data);
  });

  // GET /api/admin/pages/:slug
  app.get<{ Params: { slug: string } }>(ROUTE_TEMPLATES.admin.pages.detail, async (request, reply) => {
    const result = await getManagedContentPage(request.params.slug);
    if (!result.ok)
      return reply.status(statusCodeForError(result.code)).send({ error: result.code, message: result.message });
    return result.data;
  });

  // PATCH /api/admin/pages/:slug — meta or body
  app.patch<{ Params: { slug: string } }>(
    ROUTE_TEMPLATES.admin.pages.detail,
    async (request: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
      const body = request.body;
      const callerId = getCallerId(request);

      // If body has `content`, treat as body update; otherwise meta update.
      if (isPlainObject(body) && typeof body.content === "string") {
        const result = await updateManagedContentPageBody(request.params.slug, body.content, callerId);
        if (!result.ok)
          return reply.status(statusCodeForError(result.code)).send({ error: result.code, message: result.message });
        return result.data;
      }

      const validated = validateMetaBody(body);
      if (typeof validated === "string") {
        return reply.status(400).send({ error: "INVALID_INPUT", message: validated });
      }
      const result = await updateManagedContentPageMeta(request.params.slug, { ...validated, updatedBy: callerId });
      if (!result.ok)
        return reply.status(statusCodeForError(result.code)).send({ error: result.code, message: result.message });
      return result.data;
    },
  );

  // DELETE /api/admin/pages/:slug
  app.delete<{ Params: { slug: string } }>(ROUTE_TEMPLATES.admin.pages.detail, async (request, reply) => {
    const result = await deleteManagedContentPage(request.params.slug);
    if (!result.ok)
      return reply.status(statusCodeForError(result.code)).send({ error: result.code, message: result.message });
    return reply.status(204).send();
  });
}
