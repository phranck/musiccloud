import swagger from "@fastify/swagger";
import {
  ContentContext,
  ENDPOINTS,
  NavigationArea,
  NavigationSystemKey,
  NavigationTargetKind,
} from "@musiccloud/shared";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

const mocks = vi.hoisted(() => ({
  getContentPageById: vi.fn(),
  getPublishedContentPageByPath: vi.fn(),
  listNavigationConfiguration: vi.fn(),
  renderMarkdown: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  getAdminRepository: vi.fn(async () => ({
    getContentPageById: mocks.getContentPageById,
    getPublishedContentPageByPath: mocks.getPublishedContentPageByPath,
    listNavigationConfiguration: mocks.listNavigationConfiguration,
  })),
}));

vi.mock("../services/markdown/renderer.js", () => ({
  renderMarkdown: mocks.renderMarkdown,
}));

const { internalEditorialRoutes } = await import("./internal-editorial.js");

const publication = {
  pageId: "page-privacy",
  context: ContentContext.DeveloperPortal,
  path: "/privacy",
  status: "published",
  templateKey: "developer-default",
} as const;

const page = {
  id: "page-privacy",
  slug: "privacy",
  contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
  publications: [publication],
  title: "Privacy",
  status: "published",
  showTitle: true,
  titleAlignment: "left",
  pageType: "default",
  displayMode: "embossed",
  overlayWidth: "regular",
  contentCardStyle: "default",
  content: "# Privacy",
  contentUpdatedAt: new Date("2026-07-18T00:00:00Z"),
  createdBy: null,
  updatedBy: null,
  createdAt: new Date("2026-07-18T00:00:00Z"),
  updatedAt: null,
} as const;

function systemEntry(
  id: number,
  systemKey: (typeof NavigationSystemKey)[keyof typeof NavigationSystemKey],
  area: number,
  position: number,
) {
  return {
    id,
    targetKind: NavigationTargetKind.System,
    pageId: null,
    pageSlug: null,
    pageTitle: null,
    url: null,
    systemKey,
    target: "_self",
    label: null,
    contextMask: ContentContext.DeveloperPortal,
    areaMask: area,
    labelUpdatedAt: new Date("2026-07-18T00:00:00Z"),
    placements: [{ context: ContentContext.DeveloperPortal, area, position }],
  };
}

async function createApp(logs?: string[]) {
  const app = Fastify({
    logger: logs
      ? {
          level: "error",
          stream: { write: (line: string) => logs.push(line) },
        }
      : false,
  });
  registerApiErrorHandling(app);
  await app.register(swagger, { openapi: { info: { title: "test", version: "1.0.0" } } });
  app.decorate("authenticateInternal", async (request, reply) => {
    if (request.headers["x-api-key"] !== "internal-test-key") {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or missing API key." });
    }
  });
  await app.register(async (internalApp) => {
    internalApp.addHook("preHandler", internalApp.authenticateInternal);
    await internalApp.register(internalEditorialRoutes);
  });
  await app.ready();
  return app;
}

describe("internal Developer Portal editorial routes", () => {
  beforeEach(() => {
    mocks.getContentPageById.mockReset();
    mocks.getPublishedContentPageByPath.mockReset();
    mocks.listNavigationConfiguration.mockReset();
    mocks.renderMarkdown.mockReset();
    mocks.getPublishedContentPageByPath.mockResolvedValue(page);
    mocks.getContentPageById.mockResolvedValue(page);
    mocks.renderMarkdown.mockResolvedValue("<h1>Privacy</h1>");
    mocks.listNavigationConfiguration.mockResolvedValue([
      systemEntry(1, NavigationSystemKey.Docs, NavigationArea.Main, 2),
      systemEntry(2, NavigationSystemKey.ApiReference, NavigationArea.Footer, 0),
      systemEntry(3, NavigationSystemKey.Search, NavigationArea.Main, 1),
      {
        id: 4,
        targetKind: NavigationTargetKind.Page,
        pageId: "page-privacy",
        pageSlug: "privacy",
        pageTitle: "Privacy",
        url: null,
        systemKey: null,
        target: "_self",
        label: "Privacy policy",
        contextMask: ContentContext.DeveloperPortal,
        areaMask: NavigationArea.Main,
        labelUpdatedAt: new Date("2026-07-18T00:00:00Z"),
        placements: [
          {
            context: ContentContext.DeveloperPortal,
            area: NavigationArea.Main,
            position: 0,
          },
        ],
      },
    ]);
  });

  it("requires internal authentication and keeps a stable error envelope", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: ENDPOINTS.internal.developer.editorial.page("/privacy") });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "MC-AUTH-0001", errorId: expect.any(String) });
  });

  it("binds Page reads to the Developer Portal and returns rendered published content", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: ENDPOINTS.internal.developer.editorial.page("/privacy"),
      headers: { "x-api-key": "internal-test-key" },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.getPublishedContentPageByPath).toHaveBeenCalledWith(ContentContext.DeveloperPortal, "/privacy");
    expect(mocks.renderMarkdown).toHaveBeenCalledWith("# Privacy", ContentContext.DeveloperPortal);
    expect(response.json()).toMatchObject({
      id: "page-privacy",
      path: "/privacy",
      title: "Privacy",
      templateKey: "developer-default",
      contentHtml: "<h1>Privacy</h1>",
    });
  });

  it("sanitizes rendered Markdown HTML before returning managed content", async () => {
    mocks.renderMarkdown.mockResolvedValue(
      '<h2 class="safe">Overview</h2><img src="x" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">unsafe</a><a href="/docs">safe</a>',
    );
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: ENDPOINTS.internal.developer.editorial.page("/privacy"),
      headers: { "x-api-key": "internal-test-key" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().contentHtml).toContain('<h2 class="safe">Overview</h2>');
    expect(response.json().contentHtml).toContain('<a href="/docs">safe</a>');
    expect(response.json().contentHtml).not.toMatch(/<script|onerror|javascript:/i);
  });

  it("rejects context selection and never reads the protected docs namespace", async () => {
    const app = await createApp();
    const contextResponse = await app.inject({
      method: "GET",
      url: `${ENDPOINTS.internal.developer.editorial.page("/privacy")}&context=1`,
      headers: { "x-api-key": "internal-test-key" },
    });
    const docsResponse = await app.inject({
      method: "GET",
      url: ENDPOINTS.internal.developer.editorial.page("/docs/private-sdk"),
      headers: { "x-api-key": "internal-test-key" },
    });

    expect(contextResponse.statusCode).toBe(400);
    expect(docsResponse.statusCode).toBe(404);
    expect(docsResponse.json()).toMatchObject({ error: "MC-RES-0003", errorId: expect.any(String) });
    expect(mocks.getPublishedContentPageByPath).not.toHaveBeenCalled();
  });

  it("returns NotFound for unpublished or unknown content", async () => {
    mocks.getPublishedContentPageByPath.mockResolvedValue(null);
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: ENDPOINTS.internal.developer.editorial.page("/draft"),
      headers: { "x-api-key": "internal-test-key" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "MC-RES-0003", errorId: expect.any(String) });
  });

  it("projects and sorts one managed area while resolving protected system targets without Page rows", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: ENDPOINTS.internal.developer.editorial.navigation("main"),
      headers: { "x-api-key": "internal-test-key" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      area: NavigationArea.Main,
      items: [
        expect.objectContaining({ label: "Privacy policy", href: "/privacy", systemKey: null }),
        expect.objectContaining({ label: "Search", href: "/docs/api?search=1", behavior: "open-api-search" }),
        expect.objectContaining({ label: "Docs", href: "/docs", systemKey: NavigationSystemKey.Docs }),
      ],
    });
    expect(mocks.getContentPageById).toHaveBeenCalledTimes(1);
  });

  it("accepts only the Main and Footer navigation areas", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/internal/developer/editorial/navigation/sidebar",
      headers: { "x-api-key": "internal-test-key" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "MC-REQ-0001", errorId: expect.any(String) });
    expect(mocks.listNavigationConfiguration).not.toHaveBeenCalled();
  });

  it("preserves stable failures and errorIds while logging redacted correlation data", async () => {
    const logs: string[] = [];
    mocks.listNavigationConfiguration.mockRejectedValue(new Error("postgres://secret@db/editorial"));
    const app = await createApp(logs);
    const response = await app.inject({
      method: "GET",
      url: ENDPOINTS.internal.developer.editorial.navigation("footer"),
      headers: { "x-api-key": "internal-test-key" },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: "MC-SYS-0001", errorId: expect.any(String) });
    expect(response.body).not.toContain("postgres://");
    const log = logs.join("\n");
    expect(log).toContain('"errorCode":"MC-SYS-0001"');
    expect(log).toContain('"requestId":');
    expect(log).toContain('"route":"/api/internal/developer/editorial/navigation/:area"');
    expect(log).toContain("[REDACTED_DB_URL]");
    expect(log).not.toContain("secret@db");
  });

  it("stays excluded from the collected OpenAPI document", async () => {
    const app = await createApp();
    const document = app.swagger();

    expect(document.paths).not.toHaveProperty("/api/internal/developer/editorial/page");
    expect(document.paths).not.toHaveProperty("/api/internal/developer/editorial/navigation/{area}");
  });
});
