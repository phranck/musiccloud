import { ContentContext, ENDPOINTS } from "@musiccloud/shared";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPublicErrorResponseSchema } from "../docs/public-response-schema.js";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";
import { NavItemSchema, PublicContentPageSchema, PublicPageSegmentSchema } from "../schemas/openapi-schemas.js";

const mocks = vi.hoisted(() => ({
  getPublicContentPage: vi.fn(),
  updateManagedContentPageMeta: vi.fn(),
}));

vi.mock("../services/admin-content.js", () => ({
  createManagedContentPage: vi.fn(),
  deleteManagedContentPage: vi.fn(),
  getManagedContentPage: vi.fn(),
  getManagedContentPages: vi.fn().mockResolvedValue([]),
  getPublicContentPage: mocks.getPublicContentPage,
  getPublicContentPages: vi.fn().mockResolvedValue([]),
  updateManagedContentPageBody: vi.fn(),
  updateManagedContentPageMeta: mocks.updateManagedContentPageMeta,
}));

vi.mock("../services/admin-nav.js", () => ({
  getPublicNavItems: vi.fn().mockResolvedValue([]),
  isValidNavId: vi.fn().mockReturnValue(true),
}));

vi.mock("../services/admin-pages-bulk.js", () => ({ bulkUpdatePages: vi.fn() }));
vi.mock("../services/admin-segments.js", () => ({ replaceSegments: vi.fn() }));
vi.mock("../routes/admin-page-translations.js", () => ({ registerAdminPageTranslationRoutes: vi.fn() }));

const adminContentRoutes = (await import("../routes/admin-content.js")).default;
const publicContentNavRoutes = (await import("../routes/public-content-nav.js")).default;

const apps: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function createApp(logLines: string[]) {
  const app = Fastify({
    logger: {
      level: "warn",
      stream: { write: (line: string) => logLines.push(line) },
    },
  });
  apps.push(app);
  registerApiErrorHandling(app);
  app.addSchema(createPublicErrorResponseSchema());
  app.addSchema(PublicPageSegmentSchema);
  app.addSchema(PublicContentPageSchema);
  app.addSchema(NavItemSchema);
  app.addHook("preHandler", (request, _reply, done) => {
    request.user = { sub: "admin-1" };
    done();
  });
  await app.register(adminContentRoutes);
  await app.register(publicContentNavRoutes);
  return app;
}

function recordsFor(logLines: string[], errorId: string): Array<Record<string, unknown>> {
  return logLines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((record) => record.errorId === errorId);
}

describe("contextual content route error contract", () => {
  beforeEach(() => {
    mocks.getPublicContentPage.mockReset().mockResolvedValue(null);
    mocks.updateManagedContentPageMeta.mockReset();
  });

  it("normalizes publications validation and path-conflict errors through the global boundary", async () => {
    const logLines: string[] = [];
    const app = await createApp(logLines);
    const invalid = await app.inject({
      method: "PUT",
      url: ENDPOINTS.admin.pages.publications("page-1"),
      payload: { contextMask: ContentContext.Frontend },
    });

    mocks.updateManagedContentPageMeta.mockResolvedValueOnce({
      ok: false,
      code: "PATH_TAKEN",
      message: "A page already publishes at this context path",
    });
    const conflict = await app.inject({
      method: "PUT",
      url: ENDPOINTS.admin.pages.publications("page-1"),
      payload: {
        contextMask: ContentContext.Frontend,
        publications: [
          {
            context: ContentContext.Frontend,
            path: "/privacy",
            status: "published",
            templateKey: "frontend-default",
          },
        ],
      },
    });

    const invalidBody = invalid.json() as { error: string; errorId: string; message: string };
    const conflictBody = conflict.json() as { error: string; errorId: string; message: string };
    expect(invalid.statusCode).toBe(400);
    expect(invalidBody).toMatchObject({
      error: "MC-REQ-0001",
      errorId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      message: expect.stringContaining("(MC-REQ-0001)"),
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflictBody).toMatchObject({
      error: "MC-REQ-0002",
      errorId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      message: "A page already publishes at this context path (MC-REQ-0002)",
    });
    expect(conflictBody.errorId).not.toBe(invalidBody.errorId);
    expect(conflict.body).not.toContain("PATH_TAKEN");
    expect(recordsFor(logLines, invalidBody.errorId)).toEqual([
      expect.objectContaining({
        errorCode: "MC-REQ-0001",
        operation: "http_request",
        route: "/api/admin/pages/:id/publications",
        statusCode: 400,
      }),
    ]);
    expect(recordsFor(logLines, conflictBody.errorId)).toEqual([
      expect.objectContaining({
        errorCode: "MC-REQ-0002",
        operation: "http_request",
        route: "/api/admin/pages/:id/publications",
        statusCode: 409,
      }),
    ]);
  });

  it("normalizes public path-validation and not-found responses with distinct correlated IDs", async () => {
    const logLines: string[] = [];
    const app = await createApp(logLines);
    const invalid = await app.inject({ method: "GET", url: "/api/v1/content/%252e%252e" });
    const missing = await app.inject({ method: "GET", url: "/api/v1/content/missing" });

    const invalidBody = invalid.json() as { error: string; errorId: string; message: string };
    const missingBody = missing.json() as { error: string; errorId: string; message: string };
    expect(invalid.statusCode).toBe(400);
    expect(invalidBody).toMatchObject({
      error: "MC-REQ-0001",
      errorId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      message: expect.stringContaining("(MC-REQ-0001)"),
    });
    expect(missing.statusCode).toBe(404);
    expect(missingBody).toMatchObject({
      error: "MC-RES-0003",
      errorId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      message: "Content page not found (MC-RES-0003)",
    });
    expect(missingBody.errorId).not.toBe(invalidBody.errorId);
    expect(recordsFor(logLines, invalidBody.errorId)).toEqual([
      expect.objectContaining({
        errorCode: "MC-REQ-0001",
        operation: "http_request",
        route: "/api/v1/content/:slug",
        statusCode: 400,
      }),
    ]);
    expect(recordsFor(logLines, missingBody.errorId)).toEqual([
      expect.objectContaining({
        errorCode: "MC-RES-0003",
        operation: "http_request",
        route: "/api/v1/content/:slug",
        statusCode: 404,
      }),
    ]);
  });
});
