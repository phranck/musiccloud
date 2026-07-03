/**
 * @file Admin CRUD for admin-built forms (MC-082, ported from lmaa.space).
 *
 * Registered inside the admin scope in `server.ts`, so every handler runs
 * after `authenticateAdmin`. Persistence goes straight to the
 * {@link AdminRepository} — uniqueness conflicts come back as discriminated
 * results and map to 409s whose messages name the violated field ("name" /
 * "slug"), which the dashboard's create dialog string-matches on.
 *
 * The public submit endpoint is deliberately NOT here (see
 * `forms-public.ts`) — it is unauthenticated and rate-limited.
 */

import { ENDPOINTS, type FormConfigPayload, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";

import type { FormConfigWriteErrorReason } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";

/** Public slug charset: lowercase URL-path-safe, mirroring the dashboard's create dialog. */
const SLUG_PATTERN = /^[a-z0-9-]+$/;

/** Body accepted by `POST /api/admin/forms`. */
interface CreateFormBody {
  name: string;
  slug: string;
}

/**
 * Validates a create body's shape and charset.
 *
 * @param body - the raw, untyped request body.
 * @returns the validated body, or a string error message.
 */
function validateCreateBody(body: unknown): CreateFormBody | string {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || b.name.trim().length === 0) return "name required";
  if (typeof b.slug !== "string" || !SLUG_PATTERN.test(b.slug)) {
    return "slug must contain only lowercase letters, digits and hyphens";
  }
  return { name: b.name.trim(), slug: b.slug };
}

/**
 * Validates a form payload (the editor's save body): `rows` must be an array,
 * `slug`/`submissionConfig` optional. Field-level content is intentionally
 * not deep-validated here — the editor is the trusted admin author; input
 * validation happens against the STORED definition on the public submit path.
 *
 * @param body - the raw, untyped request body.
 * @returns the validated payload, or a string error message.
 */
function validatePayloadBody(body: unknown): FormConfigPayload | string {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.rows)) return "rows must be an array";
  if (b.slug !== undefined && (typeof b.slug !== "string" || !SLUG_PATTERN.test(b.slug))) {
    return "slug must contain only lowercase letters, digits and hyphens";
  }
  if (b.submissionConfig !== undefined) {
    if (!b.submissionConfig || typeof b.submissionConfig !== "object") return "submissionConfig must be an object";
    if (!Array.isArray((b.submissionConfig as Record<string, unknown>).steps)) {
      return "submissionConfig.steps must be an array";
    }
  }
  return {
    rows: b.rows,
    slug: b.slug,
    submissionConfig: b.submissionConfig,
  } as FormConfigPayload;
}

/** Maps a repository conflict reason to the 4xx response the dashboard expects. */
function conflictResponse(reason: FormConfigWriteErrorReason): { status: 404 | 409; error: string } {
  switch (reason) {
    case "name_taken":
      return { status: 409, error: "Form name already exists" };
    case "slug_taken":
      return { status: 409, error: "Slug already in use" };
    case "not_found":
      return { status: 404, error: "Form not found" };
  }
}

export default async function adminFormsRoutes(app: FastifyInstance) {
  // GET /api/admin/forms
  app.get(ENDPOINTS.admin.forms.list, async () => {
    const repo = await getAdminRepository();
    return repo.listFormConfigs();
  });

  // POST /api/admin/forms
  app.post(ENDPOINTS.admin.forms.list, async (request, reply) => {
    const validated = validateCreateBody(request.body);
    if (typeof validated === "string") return reply.status(400).send({ error: validated });

    const repo = await getAdminRepository();
    const result = await repo.createFormConfig(validated);
    if (!result.ok) {
      const mapped = conflictResponse(result.reason);
      return reply.status(mapped.status).send({ error: mapped.error });
    }
    return reply.status(201).send(result.data);
  });

  // GET /api/admin/forms/:name
  app.get<{ Params: { name: string } }>(ROUTE_TEMPLATES.admin.forms.detail, async (request, reply) => {
    const repo = await getAdminRepository();
    const form = await repo.getFormConfigByName(request.params.name);
    if (!form) return reply.status(404).send({ error: "Form not found" });
    return form;
  });

  // PUT /api/admin/forms/:name — save the editor's payload
  app.put<{ Params: { name: string } }>(ROUTE_TEMPLATES.admin.forms.detail, async (request, reply) => {
    const validated = validatePayloadBody(request.body);
    if (typeof validated === "string") return reply.status(400).send({ error: validated });

    const repo = await getAdminRepository();
    const result = await repo.saveFormConfigPayload(request.params.name, validated);
    if (!result.ok) {
      const mapped = conflictResponse(result.reason);
      return reply.status(mapped.status).send({ error: mapped.error });
    }
    return result.data;
  });

  // PATCH /api/admin/forms/:name — toggle isActive
  app.patch<{ Params: { name: string } }>(ROUTE_TEMPLATES.admin.forms.detail, async (request, reply) => {
    const body = request.body as { isActive?: unknown } | null;
    if (typeof body?.isActive !== "boolean") {
      return reply.status(400).send({ error: "isActive must be a boolean" });
    }
    const repo = await getAdminRepository();
    const form = await repo.setFormConfigActive(request.params.name, body.isActive);
    if (!form) return reply.status(404).send({ error: "Form not found" });
    return form;
  });

  // DELETE /api/admin/forms/:name
  app.delete<{ Params: { name: string } }>(ROUTE_TEMPLATES.admin.forms.detail, async (request, reply) => {
    const repo = await getAdminRepository();
    const deleted = await repo.deleteFormConfig(request.params.name);
    if (!deleted) return reply.status(404).send({ error: "Form not found" });
    return { deleted: true };
  });

  // POST /api/admin/forms/import — create-or-overwrite a full form
  app.post(ENDPOINTS.admin.forms.import, async (request, reply) => {
    const raw = request.body as Record<string, unknown> | null;
    if (typeof raw?.name !== "string" || raw.name.trim().length === 0) {
      return reply.status(400).send({ error: "name required" });
    }
    const name = raw.name.trim();
    const overwrite = raw.overwrite === true;
    const payload = validatePayloadBody(raw);
    if (typeof payload === "string") return reply.status(400).send({ error: payload });

    const repo = await getAdminRepository();
    const existing = await repo.getFormConfigByName(name);

    if (existing) {
      if (!overwrite) return reply.status(409).send({ error: "Form name already exists" });
      const saved = await repo.saveFormConfigPayload(name, payload);
      if (!saved.ok) {
        const mapped = conflictResponse(saved.reason);
        return reply.status(mapped.status).send({ error: mapped.error });
      }
      return saved.data;
    }

    const created = await repo.createFormConfig({ name, slug: (payload.slug as string | undefined) ?? name });
    if (!created.ok) {
      const mapped = conflictResponse(created.reason);
      return reply.status(mapped.status).send({ error: mapped.error });
    }
    const saved = await repo.saveFormConfigPayload(name, payload);
    if (!saved.ok) {
      const mapped = conflictResponse(saved.reason);
      return reply.status(mapped.status).send({ error: mapped.error });
    }
    return reply.status(201).send(saved.data);
  });
}
