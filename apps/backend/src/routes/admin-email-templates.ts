import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { strToU8, zipSync } from "fflate";

import { renderEmailPreview } from "../services/email-renderer.js";
import {
  createManagedEmailTemplate,
  deleteManagedEmailTemplate,
  getManagedEmailTemplateById,
  getManagedEmailTemplates,
  importManagedEmailTemplate,
  updateManagedEmailTemplate,
} from "../services/email-templates.js";

interface EmailTemplateCreateBody {
  name: string;
  subject: string;
  headerBannerUrl?: string | null;
  headerText?: string | null;
  bodyText: string;
  footerBannerUrl?: string | null;
  footerText?: string | null;
}

interface EmailTemplateUpdateBody extends Partial<EmailTemplateCreateBody> {}

interface EmailTemplateImportBody extends EmailTemplateCreateBody {
  isSystemTemplate?: boolean;
  overwrite?: boolean;
}

interface EmailTemplatePreviewBody {
  headerBannerUrl?: string | null;
  headerText?: string | null;
  bodyText?: string | null;
  footerText?: string | null;
  footerBannerUrl?: string | null;
  colorScheme?: "light" | "dark";
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
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
  if (typeof b.bodyText !== "string" || b.bodyText.length > 50000) {
    return "bodyText required (max 50000 chars)";
  }
  for (const field of ["headerText", "footerText"] as const) {
    const v = b[field];
    if (v != null && (typeof v !== "string" || v.length > 50000)) {
      return `${field} must be string (max 50000 chars)`;
    }
  }
  for (const field of ["headerBannerUrl", "footerBannerUrl"] as const) {
    const v = b[field];
    if (v != null && typeof v !== "string") return `${field} must be string`;
  }
  return {
    name: b.name,
    subject: b.subject,
    headerBannerUrl: (b.headerBannerUrl as string | null | undefined) ?? null,
    headerText: (b.headerText as string | null | undefined) ?? null,
    bodyText: b.bodyText,
    footerBannerUrl: (b.footerBannerUrl as string | null | undefined) ?? null,
    footerText: (b.footerText as string | null | undefined) ?? null,
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
  if (b.bodyText !== undefined) {
    if (typeof b.bodyText !== "string" || b.bodyText.length > 50000) {
      return "bodyText must be string (max 50000 chars)";
    }
    out.bodyText = b.bodyText;
  }
  for (const field of ["headerText", "footerText"] as const) {
    if (b[field] !== undefined) {
      const v = b[field];
      if (v !== null && (typeof v !== "string" || v.length > 50000)) {
        return `${field} must be string or null (max 50000 chars)`;
      }
      out[field] = v as string | null;
    }
  }
  for (const field of ["headerBannerUrl", "footerBannerUrl"] as const) {
    if (b[field] !== undefined) {
      const v = b[field];
      if (v !== null && typeof v !== "string") return `${field} must be string or null`;
      out[field] = v as string | null;
    }
  }
  return out;
}

function validatePreviewBody(body: unknown): EmailTemplatePreviewBody | string {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  const scheme = b.colorScheme;
  if (scheme !== undefined && scheme !== "light" && scheme !== "dark") {
    return "colorScheme must be 'light' or 'dark'";
  }
  return {
    headerBannerUrl: (b.headerBannerUrl as string | null | undefined) ?? null,
    headerText: (b.headerText as string | null | undefined) ?? null,
    bodyText: typeof b.bodyText === "string" ? b.bodyText : "",
    footerText: (b.footerText as string | null | undefined) ?? null,
    footerBannerUrl: (b.footerBannerUrl as string | null | undefined) ?? null,
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
    const { colorScheme = "light", ...fields } = validated;
    const html = renderEmailPreview(
      {
        headerBannerUrl: fields.headerBannerUrl,
        headerText: fields.headerText,
        bodyText: fields.bodyText ?? "",
        footerText: fields.footerText,
        footerBannerUrl: fields.footerBannerUrl,
      },
      colorScheme,
    );
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

  // DELETE /api/admin/email-templates/:id
  app.delete<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.emailTemplates.detail, async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) return reply.status(400).send({ error: "Invalid ID" });
    const result = await deleteManagedEmailTemplate(id);
    if (!result.ok) return reply.status(404).send({ error: "Email template not found" });
    return { deleted: true };
  });
}
