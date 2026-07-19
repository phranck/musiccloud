import {
  type ContentContextMask,
  type ContentPublication,
  ENDPOINTS,
  OVERLAY_WIDTHS,
  type OverlayWidth,
  PAGE_DISPLAY_MODES,
  PAGE_TITLE_ALIGNMENTS,
  PAGE_TYPES,
  type PageDisplayMode,
  type PageSegmentInput,
  type PagesBulkRequest,
  type PageTitleAlignment,
  type PageType,
  ROUTE_TEMPLATES,
} from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  createManagedContentPage,
  deleteManagedContentPage,
  getManagedContentPage,
  getManagedContentPages,
  updateManagedContentPageBody,
  updateManagedContentPageMeta,
} from "../services/admin-content.js";
import { bulkUpdatePages } from "../services/admin-pages-bulk.js";
import { replaceSegments } from "../services/admin-segments.js";

function getCallerId(request: FastifyRequest): string | null {
  const payload = request.user as { sub?: string } | undefined;
  return payload?.sub ?? null;
}

function statusCodeForError(
  code: "NOT_FOUND" | "SLUG_TAKEN" | "PATH_TAKEN" | "INVALID_INPUT" | "TARGET_NOT_FOUND" | "TARGET_NOT_DEFAULT",
): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "SLUG_TAKEN":
    case "PATH_TAKEN":
      return 409;
    case "INVALID_INPUT":
    case "TARGET_NOT_FOUND":
    case "TARGET_NOT_DEFAULT":
      return 400;
  }
}

interface ContentCreateBody {
  slug: string;
  title: string;
  contextMask?: ContentContextMask;
  publications?: ContentPublication[];
  status?: "draft" | "published" | "hidden";
  pageType?: PageType;
}

interface ContentMetaBody {
  contextMask?: ContentContextMask;
  publications?: ContentPublication[];
  title?: string;
  slug?: string;
  status?: "draft" | "published" | "hidden";
  showTitle?: boolean;
  titleAlignment?: PageTitleAlignment;
  pageType?: PageType;
  displayMode?: PageDisplayMode;
  overlayWidth?: OverlayWidth;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isOneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

function validateCreateBody(body: unknown): ContentCreateBody | string {
  if (!isPlainObject(body)) return "body must be an object";
  if (typeof body.slug !== "string") return "slug must be string";
  if (typeof body.title !== "string") return "title must be string";
  const out: ContentCreateBody = { slug: body.slug, title: body.title };
  const contextual = validateContextualFields(body);
  if (typeof contextual === "string") return contextual;
  Object.assign(out, contextual);
  if (body.status !== undefined) {
    if (body.status !== "draft" && body.status !== "published" && body.status !== "hidden") {
      return "status must be draft, published, or hidden";
    }
    out.status = body.status;
  }
  if (body.pageType !== undefined) {
    if (!isOneOf(PAGE_TYPES, body.pageType)) return "pageType must be 'default' or 'segmented'";
    out.pageType = body.pageType;
  }
  return out;
}

function validateMetaBody(body: unknown): ContentMetaBody | string {
  if (!isPlainObject(body)) return "body must be an object";
  const out: ContentMetaBody = {};
  const contextual = validateContextualFields(body);
  if (typeof contextual === "string") return contextual;
  Object.assign(out, contextual);
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
  if (body.titleAlignment !== undefined) {
    if (!isOneOf(PAGE_TITLE_ALIGNMENTS, body.titleAlignment)) return "titleAlignment invalid";
    out.titleAlignment = body.titleAlignment;
  }
  if (body.pageType !== undefined) {
    if (!isOneOf(PAGE_TYPES, body.pageType)) return "pageType must be 'default' or 'segmented'";
    out.pageType = body.pageType;
  }
  if (body.displayMode !== undefined) {
    if (!isOneOf(PAGE_DISPLAY_MODES, body.displayMode)) return "displayMode invalid";
    out.displayMode = body.displayMode;
  }
  if (body.overlayWidth !== undefined) {
    if (!isOneOf(OVERLAY_WIDTHS, body.overlayWidth)) return "overlayWidth invalid";
    out.overlayWidth = body.overlayWidth;
  }
  return out;
}

function validateContextualFields(
  body: Record<string, unknown>,
): Pick<ContentMetaBody, "contextMask" | "publications"> | string {
  const out: Pick<ContentMetaBody, "contextMask" | "publications"> = {};
  if (body.contextMask !== undefined) {
    if (typeof body.contextMask !== "number" || !Number.isInteger(body.contextMask))
      return "contextMask must be integer";
    out.contextMask = body.contextMask;
  }
  if (body.publications !== undefined) {
    if (!Array.isArray(body.publications)) return "publications must be an array";
    const publications: ContentPublication[] = [];
    for (const raw of body.publications) {
      if (!isPlainObject(raw)) return "publication must be an object";
      if (typeof raw.context !== "number") return "publication.context must be number";
      if (typeof raw.path !== "string") return "publication.path must be string";
      if (raw.status !== "draft" && raw.status !== "published" && raw.status !== "hidden") {
        return "publication.status invalid";
      }
      if (typeof raw.templateKey !== "string") return "publication.templateKey must be string";
      publications.push({
        context: raw.context as ContentPublication["context"],
        path: raw.path,
        status: raw.status,
        templateKey: raw.templateKey,
      });
    }
    out.publications = publications;
  }
  return out;
}

function validateSegmentsBody(body: unknown): PageSegmentInput[] | string {
  if (!Array.isArray(body)) return "body must be an array";
  const out: PageSegmentInput[] = [];
  for (let i = 0; i < body.length; i++) {
    const raw = body[i];
    if (!isPlainObject(raw)) return "segment must be an object";
    if (typeof raw.label !== "string") return "label must be string";
    if (typeof raw.targetSlug !== "string") return "targetSlug must be string";
    if (typeof raw.position !== "number") return "position must be number";
    out.push({ label: raw.label, targetSlug: raw.targetSlug, position: raw.position });
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

  // PUT /api/admin/pages/:id/publications — replace contextual publication state
  app.put<{ Params: { id: string }; Body: unknown }>(
    ROUTE_TEMPLATES.admin.pages.publications,
    async (request, reply) => {
      if (!isPlainObject(request.body)) {
        return reply.status(400).send({ error: "INVALID_INPUT", message: "body must be an object" });
      }
      const contextual = validateContextualFields(request.body);
      if (typeof contextual === "string" || contextual.contextMask === undefined || !contextual.publications) {
        return reply.status(400).send({
          error: "INVALID_INPUT",
          message: typeof contextual === "string" ? contextual : "contextMask and publications are required",
        });
      }
      const result = await updateManagedContentPageMeta(request.params.id, {
        ...contextual,
        updatedBy: getCallerId(request),
      });
      if (!result.ok) {
        return reply.status(statusCodeForError(result.code)).send({ error: result.code, message: result.message });
      }
      return result.data;
    },
  );

  // PUT /api/admin/pages/bulk — atomic multi-section page update
  app.put(ROUTE_TEMPLATES.admin.pages.bulk, async (request, reply) => {
    const updatedBy = getCallerId(request);
    const result = await bulkUpdatePages(request.body as PagesBulkRequest, { updatedBy });
    if (!result.ok) {
      return reply.status(400).send({ error: result.code, details: result.details });
    }
    return reply.send({ pages: result.data });
  });

  // PUT /api/admin/pages/:slug/segments — replace the segment list atomically
  app.put<{ Params: { slug: string }; Body: unknown }>(
    `${ROUTE_TEMPLATES.admin.pages.detail}/segments`,
    async (request, reply) => {
      const validated = validateSegmentsBody(request.body);
      if (typeof validated === "string") {
        return reply.status(400).send({ error: "INVALID_INPUT", message: validated });
      }
      const result = await replaceSegments(request.params.slug, validated);
      if (!result.ok)
        return reply.status(statusCodeForError(result.code)).send({ error: result.code, message: result.message });
      return result.data;
    },
  );
}
