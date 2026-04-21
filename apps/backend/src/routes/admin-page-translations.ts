import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  deletePageTranslation,
  getPageTranslationsWithStatus,
  upsertPageTranslation,
} from "../services/admin-translations.js";

interface TranslationBody {
  title?: unknown;
  content?: unknown;
  translationReady?: unknown;
}

function getCallerId(request: FastifyRequest): string | null {
  const payload = request.user as { sub?: string } | undefined;
  return payload?.sub ?? null;
}

function validateBody(body: unknown):
  | { ok: true; data: { title: string; content: string; translationReady: boolean } }
  | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "body must be an object" };
  }
  const b = body as TranslationBody;
  if (typeof b.title !== "string") return { ok: false, message: "title must be string" };
  if (b.content !== undefined && typeof b.content !== "string") {
    return { ok: false, message: "content must be string" };
  }
  if (b.translationReady !== undefined && typeof b.translationReady !== "boolean") {
    return { ok: false, message: "translationReady must be boolean" };
  }
  return {
    ok: true,
    data: {
      title: b.title,
      content: typeof b.content === "string" ? b.content : "",
      translationReady: b.translationReady === true,
    },
  };
}

export function registerAdminPageTranslationRoutes(app: FastifyInstance): void {
  // GET /api/admin/pages/:slug/translations
  app.get<{ Params: { slug: string } }>(
    ROUTE_TEMPLATES.admin.pages.translationsList,
    async (request, reply) => {
      try {
        const data = await getPageTranslationsWithStatus(request.params.slug);
        return reply.send({
          statuses: data.statuses,
          translations: data.translations.map((t) => ({
            locale: t.locale,
            title: t.title,
            content: t.content,
            translationReady: t.translationReady,
            sourceUpdatedAt: t.sourceUpdatedAt?.toISOString() ?? null,
            updatedAt: t.updatedAt.toISOString(),
          })),
        });
      } catch {
        return reply.code(404).send({ error: "NOT_FOUND" });
      }
    },
  );

  // PUT /api/admin/pages/:slug/translations/:locale
  app.put<{ Params: { slug: string; locale: string } }>(
    ROUTE_TEMPLATES.admin.pages.translationsDetail,
    async (request, reply) => {
      const parsed = validateBody(request.body);
      if (!parsed.ok) {
        return reply.code(400).send({ error: "INVALID_INPUT", message: parsed.message });
      }
      const res = await upsertPageTranslation(
        request.params.slug,
        request.params.locale,
        parsed.data,
        getCallerId(request),
      );
      if (!res.ok) {
        const code = res.code === "NOT_FOUND" ? 404 : 400;
        return reply.code(code).send({ error: res.code, message: res.message });
      }
      return reply.send({
        locale: res.data.locale,
        title: res.data.title,
        content: res.data.content,
        translationReady: res.data.translationReady,
        sourceUpdatedAt: res.data.sourceUpdatedAt?.toISOString() ?? null,
        updatedAt: res.data.updatedAt.toISOString(),
      });
    },
  );

  // DELETE /api/admin/pages/:slug/translations/:locale
  app.delete<{ Params: { slug: string; locale: string } }>(
    ROUTE_TEMPLATES.admin.pages.translationsDetail,
    async (request, reply) => {
      const res = await deletePageTranslation(request.params.slug, request.params.locale);
      if (!res.ok) {
        const code = res.code === "NOT_FOUND" ? 404 : 400;
        return reply.code(code).send({ error: res.code, message: res.message });
      }
      return reply.code(204).send();
    },
  );
}
