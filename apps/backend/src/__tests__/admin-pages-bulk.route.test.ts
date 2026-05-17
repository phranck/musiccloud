import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import adminContentRoutes from "../routes/admin-content.js";
import * as bulk from "../services/admin-pages-bulk.js";

vi.mock("../services/admin-pages-bulk.js", () => ({
  bulkUpdatePages: vi.fn(),
}));

function buildTestApp() {
  const app = Fastify();
  app.addHook("preHandler", (req, _res, done) => {
    (req as unknown as { user: unknown }).user = { sub: "admin-1" };
    done();
  });
  app.register(adminContentRoutes);
  return app;
}

const route = ROUTE_TEMPLATES.admin.pages.bulk;
const summary = {
  slug: "info",
  title: "Information",
  status: "draft",
  pageType: "segmented",
  position: 0,
} as never;

describe("PUT /admin/pages/bulk", () => {
  beforeEach(() => {
    vi.mocked(bulk.bulkUpdatePages).mockReset();
  });

  it("pages-only meta update: forwards payload, returns 200 with pages", async () => {
    vi.mocked(bulk.bulkUpdatePages).mockResolvedValue({
      ok: true,
      data: [{ ...summary, title: "Information" }],
    });
    const app = buildTestApp();
    const res = await app.inject({
      method: "PUT",
      url: route,
      payload: { pages: [{ slug: "info", meta: { title: "Information" } }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().pages[0].title).toBe("Information");
    expect(bulk.bulkUpdatePages).toHaveBeenCalledWith(
      expect.objectContaining({ pages: [{ slug: "info", meta: { title: "Information" } }] }),
      expect.objectContaining({ updatedBy: "admin-1" }),
    );
  });

  it("cross-owner segment move: forwards segments[] correctly", async () => {
    vi.mocked(bulk.bulkUpdatePages).mockResolvedValue({ ok: true, data: [summary] });
    const app = buildTestApp();
    const res = await app.inject({
      method: "PUT",
      url: route,
      payload: {
        segments: [
          { ownerSlug: "help", segments: [] },
          { ownerSlug: "info", segments: [{ position: 0, label: "Privacy", targetSlug: "privacy" }] },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const arg = vi.mocked(bulk.bulkUpdatePages).mock.calls[0]![0];
    expect(arg.segments).toHaveLength(2);
    expect(arg.segments![0].ownerSlug).toBe("help");
    expect(arg.segments![1].segments[0].targetSlug).toBe("privacy");
  });

  it("top-level reorder: forwards topLevelOrder", async () => {
    vi.mocked(bulk.bulkUpdatePages).mockResolvedValue({ ok: true, data: [summary] });
    const app = buildTestApp();
    const res = await app.inject({
      method: "PUT",
      url: route,
      payload: { topLevelOrder: ["info", "help"] },
    });
    expect(res.statusCode).toBe(200);
    const arg = vi.mocked(bulk.bulkUpdatePages).mock.calls[0]![0];
    expect(arg.topLevelOrder).toEqual(["info", "help"]);
  });

  it("full mixed payload: forwards all four sections + opts.updatedBy", async () => {
    vi.mocked(bulk.bulkUpdatePages).mockResolvedValue({ ok: true, data: [summary] });
    const app = buildTestApp();
    const res = await app.inject({
      method: "PUT",
      url: route,
      payload: {
        pages: [{ slug: "info", meta: { title: "Info v2" }, content: "# Info v2" }],
        segments: [{ ownerSlug: "info", segments: [{ position: 0, label: "Privacy", targetSlug: "privacy" }] }],
        pageTranslations: [{ slug: "info", locale: "de", title: "Information" }],
        topLevelOrder: ["info", "help"],
      },
    });
    expect(res.statusCode).toBe(200);
    const [body, opts] = vi.mocked(bulk.bulkUpdatePages).mock.calls[0]!;
    expect(body.pages).toHaveLength(1);
    expect(body.segments).toHaveLength(1);
    expect(body.pageTranslations).toHaveLength(1);
    expect(body.topLevelOrder).toEqual(["info", "help"]);
    expect(opts).toEqual({ updatedBy: "admin-1" });
  });

  it("partial-fail (TX-rollback): service throws → route returns 500", async () => {
    vi.mocked(bulk.bulkUpdatePages).mockRejectedValue(new Error("DB error"));
    const app = buildTestApp();
    const res = await app.inject({
      method: "PUT",
      url: route,
      payload: { pages: [{ slug: "info", meta: { title: "x" } }] },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
  });

  it("validation 400 + details[]: service returns INVALID_INPUT", async () => {
    vi.mocked(bulk.bulkUpdatePages).mockResolvedValue({
      ok: false,
      code: "INVALID_INPUT",
      details: [{ section: "pageTranslations", index: 0, message: "invalid locale" }],
    });
    const app = buildTestApp();
    const res = await app.inject({
      method: "PUT",
      url: route,
      payload: { pageTranslations: [{ slug: "info", locale: "xx", title: "x" }] },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("INVALID_INPUT");
    expect(body.details).toHaveLength(1);
    expect(body.details[0].section).toBe("pageTranslations");
  });

  it("empty payload → 200 noop", async () => {
    vi.mocked(bulk.bulkUpdatePages).mockResolvedValue({ ok: true, data: [] });
    const app = buildTestApp();
    const res = await app.inject({ method: "PUT", url: route, payload: {} });
    expect(res.statusCode).toBe(200);
  });
});
