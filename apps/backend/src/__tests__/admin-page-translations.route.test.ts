import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerAdminPageTranslationRoutes } from "../routes/admin-page-translations.js";
import * as adminTranslations from "../services/admin-translations.js";

vi.mock("../services/admin-translations.js", () => ({
  getPageTranslationsWithStatus: vi.fn(async (slug: string) => ({
    translations: [],
    statuses: { en: "ready", de: "missing" },
    page: { slug } as never,
  })),
  upsertPageTranslation: vi.fn(async () => ({
    ok: true,
    data: {
      slug: "s", locale: "de", title: "T", content: "",
      translationReady: true,
      sourceUpdatedAt: new Date(), updatedAt: new Date(), updatedBy: null,
    },
  })),
  deletePageTranslation: vi.fn(async () => ({ ok: true, data: true as const })),
}));

function buildApp() {
  const app = Fastify();
  app.addHook("preHandler", (req, _res, done) => {
    (req as unknown as { user: unknown }).user = { sub: "admin-1" };
    done();
  });
  registerAdminPageTranslationRoutes(app);
  return app;
}

describe("admin-page-translations routes", () => {
  it("GET /api/admin/pages/:slug/translations returns translations + statuses", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/admin/pages/s/translations" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.statuses.de).toBe("missing");
  });

  it("PUT /api/admin/pages/:slug/translations/:locale returns 200 on ok", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/pages/s/translations/de",
      payload: { title: "T", content: "", translationReady: true },
    });
    expect(res.statusCode).toBe(200);
  });

  it("PUT rejects missing title with 400", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/pages/s/translations/de",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE returns 204 on success", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "DELETE", url: "/api/admin/pages/s/translations/de" });
    expect(res.statusCode).toBe(204);
  });

  it("GET returns 404 when getPageTranslationsWithStatus resolves to null", async () => {
    vi.mocked(adminTranslations.getPageTranslationsWithStatus).mockResolvedValueOnce(null);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/admin/pages/missing/translations" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NOT_FOUND");
  });

  it("PUT rejects empty string title with 400", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/pages/s/translations/de",
      payload: { title: "   ", content: "", translationReady: false },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("title required");
  });
});
