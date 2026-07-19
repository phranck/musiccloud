import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";
import adminContentRoutes from "../routes/admin-content.js";

function buildApp() {
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(adminContentRoutes);
  return app;
}

describe("removed admin page translation routes", () => {
  it.each([
    { method: "GET" as const, url: "/api/admin/pages/s/translations" },
    { method: "PUT" as const, url: "/api/admin/pages/s/translations/de", payload: { title: "T", content: "" } },
    { method: "DELETE" as const, url: "/api/admin/pages/s/translations/de" },
  ])("returns the stable not-found envelope for $method $url", async ({ method, url, payload }) => {
    const app = buildApp();
    const res = await app.inject({ method, url, ...(payload ? { payload } : {}) });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: "MC-RES-0003",
      errorId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      message: expect.stringContaining("MC-RES-0003"),
    });
  });
});
