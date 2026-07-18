import { ContentContext, ENDPOINTS, NavigationArea } from "@musiccloud/shared";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

const configuration = {
  entries: [
    {
      id: 1,
      targetKind: "system",
      pageId: null,
      pageSlug: null,
      pageTitle: null,
      url: null,
      systemKey: "docs",
      target: "_self",
      label: "Documentation",
      contextMask: ContentContext.DeveloperPortal,
      areaMask: NavigationArea.Main,
      placements: [{ context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position: 0 }],
      translations: {},
      canonicalRoute: "/docs",
      behavior: "navigate",
    },
  ],
};

const getManagedNavigationConfiguration = vi.fn(async () => configuration);
const replaceManagedNavigationConfiguration = vi.fn(async () => ({ ok: true as const, data: configuration }));

vi.mock("../services/admin-nav.js", () => ({
  getManagedNavigationConfiguration,
  getManagedNavItems: vi.fn(),
  isValidNavId: (value: string) => value === "header" || value === "footer",
  replaceManagedNavigationConfiguration,
  replaceManagedNavItems: vi.fn(),
}));

async function buildApp() {
  const app = Fastify({ logger: false });
  registerApiErrorHandling(app);
  const { default: adminNavRoutes } = await import("../routes/admin-nav.js");
  await app.register(adminNavRoutes);
  return app;
}

describe("contextual admin navigation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the complete navigation configuration", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: ENDPOINTS.admin.navigations.configuration });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(configuration);
    expect(getManagedNavigationConfiguration).toHaveBeenCalledOnce();
    await app.close();
  });

  it("atomically replaces the complete navigation configuration", async () => {
    const app = await buildApp();
    const input = { entries: configuration.entries.map(({ id: _id, ...entry }) => entry) };

    const response = await app.inject({
      method: "PUT",
      url: ENDPOINTS.admin.navigations.configuration,
      payload: input,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(configuration);
    expect(replaceManagedNavigationConfiguration).toHaveBeenCalledWith(input);
    await app.close();
  });

  it("preserves the public error envelope for invalid configuration", async () => {
    replaceManagedNavigationConfiguration.mockResolvedValueOnce({
      ok: false,
      code: "INVALID_INPUT",
      message: "entries[0].contextMask is invalid",
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "PUT",
      url: ENDPOINTS.admin.navigations.configuration,
      payload: { entries: [{}] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "MC-REQ-0001",
      errorId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      message: expect.stringContaining("entries[0].contextMask is invalid"),
    });
    await app.close();
  });
});
