import {
  ContentContext,
  type DeveloperPortalEditorialPage,
  type DeveloperPortalNavigation,
  type DeveloperPortalNavigationItem,
  NAVIGATION_SYSTEM_TARGETS,
  NavigationArea,
  NavigationSystemKey,
  NavigationTargetKind,
  ROUTE_TEMPLATES,
  type SingleNavigationArea,
} from "@musiccloud/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { ContentPageRow, NavigationConfigurationEntryRow } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";
import { setApiFailureDiagnostic } from "../lib/infra/api-error-handler.js";
import { createApiErrorResponse } from "../lib/infra/api-errors.js";
import { isReservedDeveloperPortalPath, normalizeEditorialPath } from "../services/editorial-path.js";
import { renderMarkdown } from "../services/markdown/renderer.js";
import { sanitizeMarkdownHtml } from "../services/markdown/sanitizer.js";

const SYSTEM_LABELS = {
  [NavigationSystemKey.Docs]: "Docs",
  [NavigationSystemKey.ApiReference]: "API reference",
  [NavigationSystemKey.Search]: "Search",
} as const;

const pageQuerySchema = {
  type: "object",
  additionalProperties: false,
  required: ["path"],
  properties: {
    path: { type: "string", minLength: 1 },
    context: { not: {} },
  },
} as const;

const navigationParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["area"],
  properties: {
    area: { type: "string", enum: ["main", "footer"] },
  },
} as const;

function developerPublication(page: ContentPageRow) {
  return page.publications?.find(
    (publication) => publication.context === ContentContext.DeveloperPortal && publication.status === "published",
  );
}

async function editorialPageByPath(path: string): Promise<DeveloperPortalEditorialPage | null> {
  const repo = await getAdminRepository();
  const row = await repo.getPublishedContentPageByPath(ContentContext.DeveloperPortal, path);
  if (!row) return null;
  const publication = developerPublication(row);
  if (!row.id || !publication || publication.path !== path) return null;

  return {
    id: row.id,
    path: publication.path,
    title: row.title,
    showTitle: row.showTitle,
    titleAlignment: row.titleAlignment,
    pageType: row.pageType,
    displayMode: row.displayMode,
    overlayWidth: row.overlayWidth,
    contentCardStyle: row.contentCardStyle,
    templateKey: publication.templateKey,
    contentHtml: sanitizeMarkdownHtml(await renderMarkdown(row.content, ContentContext.DeveloperPortal)),
  };
}

function areaBit(area: "main" | "footer"): SingleNavigationArea {
  return area === "main" ? NavigationArea.Main : NavigationArea.Footer;
}

function placementPosition(entry: NavigationConfigurationEntryRow, area: SingleNavigationArea): number | null {
  return (
    entry.placements.find(
      (placement) => placement.context === ContentContext.DeveloperPortal && placement.area === area,
    )?.position ?? null
  );
}

async function navigationItem(entry: NavigationConfigurationEntryRow): Promise<DeveloperPortalNavigationItem | null> {
  if (entry.targetKind === NavigationTargetKind.System && entry.systemKey) {
    const descriptor = NAVIGATION_SYSTEM_TARGETS[entry.systemKey];
    return {
      id: String(entry.id),
      label: entry.label?.trim() || SYSTEM_LABELS[entry.systemKey],
      href: descriptor.canonicalRoute,
      target: descriptor.target,
      targetKind: NavigationTargetKind.System,
      systemKey: entry.systemKey,
      behavior: descriptor.behavior,
    };
  }

  if (entry.targetKind === NavigationTargetKind.Url && entry.url) {
    return {
      id: String(entry.id),
      label: entry.label?.trim() || entry.url,
      href: entry.url,
      target: entry.target,
      targetKind: NavigationTargetKind.Url,
      systemKey: null,
      behavior: "navigate",
    };
  }

  if (entry.targetKind === NavigationTargetKind.Page && entry.pageId) {
    const repo = await getAdminRepository();
    const page = await repo.getContentPageById(entry.pageId);
    const publication = page ? developerPublication(page) : undefined;
    if (!page || !publication) return null;
    return {
      id: String(entry.id),
      label: entry.label?.trim() || entry.pageTitle?.trim() || page.title,
      href: publication.path,
      target: entry.target,
      targetKind: NavigationTargetKind.Page,
      systemKey: null,
      behavior: "navigate",
    };
  }

  return null;
}

async function developerNavigation(area: SingleNavigationArea): Promise<DeveloperPortalNavigation> {
  const repo = await getAdminRepository();
  const entries = await repo.listNavigationConfiguration();
  for (const key of [NavigationSystemKey.Docs, NavigationSystemKey.ApiReference, NavigationSystemKey.Search]) {
    if (!entries.some((entry) => entry.systemKey === key)) {
      throw new Error(`Protected Developer Portal navigation target is missing: ${key}`);
    }
  }

  const projected = entries
    .map((entry) => ({ entry, position: placementPosition(entry, area) }))
    .filter((value): value is { entry: NavigationConfigurationEntryRow; position: number } => value.position !== null)
    .sort((left, right) => left.position - right.position || left.entry.id - right.entry.id);
  const items = await Promise.all(projected.map(({ entry }) => navigationItem(entry)));
  return { area, items: items.filter((item): item is DeveloperPortalNavigationItem => item !== null) };
}

function recordFailure(request: FastifyRequest, operation: string): void {
  setApiFailureDiagnostic(request, {
    operation,
    outcome: "failed",
    context: "developer_portal",
  });
}

/** Narrow service-to-service reads used only by Developer Portal SSR. */
export async function internalEditorialRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { path: string } }>(
    "/api/internal/developer/editorial/page",
    { schema: { hide: true, querystring: pageQuerySchema } },
    async (request, reply) => {
      let path: string;
      try {
        path = normalizeEditorialPath(request.query.path);
      } catch {
        return reply.status(400).send(createApiErrorResponse("MC-REQ-0001"));
      }
      if (isReservedDeveloperPortalPath(path)) {
        return reply.status(404).send(createApiErrorResponse("MC-RES-0003"));
      }

      try {
        const page = await editorialPageByPath(path);
        if (!page) return reply.status(404).send(createApiErrorResponse("MC-RES-0003"));
        reply.header("Cache-Control", "private, no-store");
        return page;
      } catch (error) {
        recordFailure(request, "developer_editorial_page_read");
        throw error;
      }
    },
  );

  app.get<{ Params: { area: "main" | "footer" } }>(
    ROUTE_TEMPLATES.internal.developer.editorial.navigation,
    { schema: { hide: true, params: navigationParamsSchema } },
    async (request, reply) => {
      try {
        const navigation = await developerNavigation(areaBit(request.params.area));
        reply.header("Cache-Control", "private, no-store");
        return navigation;
      } catch (error) {
        recordFailure(request, "developer_editorial_navigation_read");
        throw error;
      }
    },
  );
}
