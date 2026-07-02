import { type EmailBlock, ENDPOINTS, isEmailBlockArray, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { strToU8, zipSync } from "fflate";

import type { EmailTemplateVariable } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";
import { requireEnv } from "../lib/env.js";
import { renderEmailPreview } from "../services/email-renderer.js";
import { sendTemplatedEmail } from "../services/email-sender.js";
import {
  createManagedEmailTemplate,
  deleteManagedEmailTemplate,
  getManagedEmailBranding,
  getManagedEmailTemplateById,
  getManagedEmailTemplates,
  importManagedEmailTemplate,
  updateManagedEmailTemplate,
} from "../services/email-templates.js";

interface EmailTemplateCreateBody {
  name: string;
  subject: string;
  blocks: EmailBlock[];
  requiredVariables: EmailTemplateVariable[];
}

interface EmailTemplateUpdateBody extends Partial<EmailTemplateCreateBody> {}

interface EmailTemplateImportBody extends EmailTemplateCreateBody {
  isSystemTemplate?: boolean;
  overwrite?: boolean;
}

interface EmailTemplatePreviewBody {
  blocks: EmailBlock[];
  colorScheme?: "light" | "dark";
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/**
 * Validates a `requiredVariables` value: an array of `{name, description}`
 * objects (both strings). Used by create/update/import — every write path
 * accepts the same shape.
 *
 * @param value - the raw, untyped value to check.
 * @returns the validated array, or a string error message.
 */
function validateRequiredVariables(value: unknown): EmailTemplateVariable[] | string {
  if (!Array.isArray(value)) return "requiredVariables must be an array";
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return "requiredVariables entries must be objects";
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== "string" || e.name.length === 0) return "requiredVariables[].name must be a non-empty string";
    if (typeof e.description !== "string") return "requiredVariables[].description must be a string";
  }
  return value as EmailTemplateVariable[];
}

function validateCreateBody(body: unknown): EmailTemplateCreateBody | string {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || b.name.length === 0 || b.name.length > 100) {
    return "name required (1-100 chars)";
  }
  if (typeof b.subject !== "string" || b.subject.length === 0 || b.subject.length > 500) {
    return "subject required (1-500 chars)";
  }
  if (!isEmailBlockArray(b.blocks)) {
    return "blocks required: must be a well-formed EmailBlock[] array";
  }
  const requiredVariables = validateRequiredVariables(b.requiredVariables ?? []);
  if (typeof requiredVariables === "string") return requiredVariables;
  return {
    name: b.name,
    subject: b.subject,
    blocks: b.blocks,
    requiredVariables,
  };
}

function validateUpdateBody(body: unknown): EmailTemplateUpdateBody | string {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  const out: EmailTemplateUpdateBody = {};
  if (b.name !== undefined) {
    if (typeof b.name !== "string" || b.name.length === 0 || b.name.length > 100) {
      return "name must be non-empty string (max 100 chars)";
    }
    out.name = b.name;
  }
  if (b.subject !== undefined) {
    if (typeof b.subject !== "string" || b.subject.length === 0 || b.subject.length > 500) {
      return "subject must be non-empty string (max 500 chars)";
    }
    out.subject = b.subject;
  }
  if (b.blocks !== undefined) {
    if (!isEmailBlockArray(b.blocks)) {
      return "blocks must be a well-formed EmailBlock[] array";
    }
    out.blocks = b.blocks;
  }
  if (b.requiredVariables !== undefined) {
    const requiredVariables = validateRequiredVariables(b.requiredVariables);
    if (typeof requiredVariables === "string") return requiredVariables;
    out.requiredVariables = requiredVariables;
  }
  return out;
}

function validatePreviewBody(body: unknown): EmailTemplatePreviewBody | string {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (!isEmailBlockArray(b.blocks)) {
    return "blocks required: must be a well-formed EmailBlock[] array";
  }
  const scheme = b.colorScheme;
  if (scheme !== undefined && scheme !== "light" && scheme !== "dark") {
    return "colorScheme must be 'light' or 'dark'";
  }
  return {
    blocks: b.blocks,
    colorScheme: (scheme as "light" | "dark" | undefined) ?? "light",
  };
}

function validateImportBody(body: unknown): EmailTemplateImportBody | string {
  const base = validateCreateBody(body);
  if (typeof base === "string") return base;
  const b = body as Record<string, unknown>;
  const overwrite = b.overwrite === true;
  const isSystemTemplate = b.isSystemTemplate === true;
  return { ...base, overwrite, isSystemTemplate };
}

export default async function adminEmailTemplateRoutes(app: FastifyInstance) {
  // GET /api/admin/email-templates
  app.get(ENDPOINTS.admin.emailTemplates.list, async () => {
    const templates = await getManagedEmailTemplates();
    return templates;
  });

  // GET /api/admin/email-templates/export
  app.get(ENDPOINTS.admin.emailTemplates.export, async (_request, reply) => {
    const templates = await getManagedEmailTemplates();
    const exportedAt = new Date().toISOString();

    const files: Record<string, Uint8Array> = {};
    for (const { id: _id, createdAt: _c, updatedAt: _u, ...fields } of templates) {
      const json = JSON.stringify({ version: 1, exportedAt, ...fields }, null, 2);
      files[`${fields.name}.json`] = strToU8(json);
    }

    const zip = zipSync(files);
    reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", 'attachment; filename="email-templates.zip"');
    return reply.send(Buffer.from(zip));
  });

  // GET /api/admin/email-templates/:id
  app.get<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.emailTemplates.detail, async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) return reply.status(400).send({ error: "Invalid ID" });
    const result = await getManagedEmailTemplateById(id);
    if (!result.ok) return reply.status(404).send({ error: "Email template not found" });
    return result.data;
  });

  // POST /api/admin/email-templates
  app.post(ENDPOINTS.admin.emailTemplates.list, async (request, reply) => {
    const validated = validateCreateBody(request.body);
    if (typeof validated === "string") {
      return reply.status(400).send({ error: validated });
    }
    const result = await createManagedEmailTemplate(validated);
    if (!result.ok) {
      if (result.reason === "name_taken") {
        return reply.status(409).send({ error: "Template name already exists" });
      }
      return reply.status(500).send({ error: "Unexpected error" });
    }
    return reply.status(201).send(result.data);
  });

  // PUT /api/admin/email-templates/:id
  app.put<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.emailTemplates.detail, async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) return reply.status(400).send({ error: "Invalid ID" });
    const validated = validateUpdateBody(request.body);
    if (typeof validated === "string") {
      return reply.status(400).send({ error: validated });
    }
    const result = await updateManagedEmailTemplate(id, validated);
    if (!result.ok) return reply.status(404).send({ error: "Email template not found" });
    return result.data;
  });

  // POST /api/admin/email-templates/preview
  app.post(ENDPOINTS.admin.emailTemplates.preview, async (request, reply) => {
    const validated = validatePreviewBody(request.body);
    if (typeof validated === "string") {
      return reply.status(400).send({ error: validated });
    }
    const branding = await getManagedEmailBranding();
    const html = renderEmailPreview(validated.blocks, branding, validated.colorScheme ?? "light");
    return { html };
  });

  // POST /api/admin/email-templates/import
  app.post(ENDPOINTS.admin.emailTemplates.import, async (request, reply) => {
    const validated = validateImportBody(request.body);
    if (typeof validated === "string") {
      return reply.status(400).send({ error: validated });
    }
    const { overwrite, ...data } = validated;
    const result = await importManagedEmailTemplate(data, overwrite ?? false);
    if (!result.ok) {
      return reply.status(409).send({ error: "Template name already exists" });
    }
    return reply.status(201).send(result.data);
  });

  // POST /api/admin/email-templates/:id/test
  app.post<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.emailTemplates.test, async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) return reply.status(400).send({ error: "Invalid ID" });

    const payload = request.user as { sub?: string } | undefined;
    if (!payload?.sub) return reply.status(401).send({ error: "UNAUTHORIZED" });

    const repo = await getAdminRepository();
    const caller = await repo.findAdminById(payload.sub);
    if (!caller?.email) {
      return reply.status(400).send({ error: "Caller has no email address on file" });
    }

    const dashboardUrl = requireEnv("DASHBOARD_URL");

    try {
      await sendTemplatedEmail({
        templateId: id,
        to: { email: caller.email, name: caller.username },
        variables: {
          username: caller.username,
          email: caller.email,
          role: caller.role,
          inviteUrl: `${dashboardUrl}/invite/test-token`,
          loginUrl: `${dashboardUrl}/login`,
        },
      });
    } catch (error) {
      request.log.error({ err: error, templateId: id }, "test email send failed");
      const message = error instanceof Error ? error.message : "Unknown error";
      return reply.status(502).send({ error: "EMAIL_SEND_FAILED", message });
    }

    return { sent: true, to: caller.email };
  });

  // DELETE /api/admin/email-templates/:id
  app.delete<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.emailTemplates.detail, async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) return reply.status(400).send({ error: "Invalid ID" });
    const result = await deleteManagedEmailTemplate(id);
    if (!result.ok) return reply.status(404).send({ error: "Email template not found" });
    return { deleted: true };
  });
}
