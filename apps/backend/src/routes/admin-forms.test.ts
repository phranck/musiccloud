/**
 * @file Route tests for the admin form-config CRUD (MC-082). Exercised through
 * `app.inject` against a bare Fastify instance (the admin-auth preHandler
 * lives in `server.ts`'s `adminRoutes` block, not in the route module). The
 * repository is fully stubbed via `../db/index.js`; body validation, status
 * mapping and 409 conflict messages are the code under test.
 */

import { ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminRepository } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";
import adminFormsRoutes from "./admin-forms.js";

vi.mock("../db/index.js", () => ({
  getAdminRepository: vi.fn(),
}));

const FORM = {
  id: 1,
  name: "contact",
  slug: "contact",
  rows: [],
  isActive: true,
  submissionConfig: undefined,
};

function makeRepo(): AdminRepository {
  return {
    listFormConfigs: vi.fn(async () => [FORM]),
    getFormConfigByName: vi.fn(async () => null),
    createFormConfig: vi.fn(async () => ({ ok: true, data: FORM })),
    saveFormConfigPayload: vi.fn(async () => ({ ok: true, data: FORM })),
    setFormConfigActive: vi.fn(async () => FORM),
    deleteFormConfig: vi.fn(async () => true),
  } as unknown as AdminRepository;
}

let app: FastifyInstance;
let repo: AdminRepository;

beforeEach(async () => {
  vi.clearAllMocks();
  repo = makeRepo();
  vi.mocked(getAdminRepository).mockResolvedValue(repo);
  app = Fastify();
  await app.register(adminFormsRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("GET /api/admin/forms", () => {
  it("lists all form configs", async () => {
    const res = await app.inject({ method: "GET", url: ENDPOINTS.admin.forms.list });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([FORM]);
  });
});

describe("POST /api/admin/forms", () => {
  it("creates an empty form and returns 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.forms.list,
      payload: { name: "contact", slug: "contact" },
    });
    expect(res.statusCode).toBe(201);
    expect(vi.mocked(repo.createFormConfig)).toHaveBeenCalledWith({ name: "contact", slug: "contact" });
  });

  it("rejects a missing name with 400", async () => {
    const res = await app.inject({ method: "POST", url: ENDPOINTS.admin.forms.list, payload: { slug: "x" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an invalid slug charset with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.forms.list,
      payload: { name: "contact", slug: "Nope Spaces" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("maps name_taken to a 409 whose message names the name", async () => {
    vi.mocked(repo.createFormConfig).mockResolvedValueOnce({ ok: false, reason: "name_taken" });
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.forms.list,
      payload: { name: "contact", slug: "contact" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.toLowerCase()).toContain("name");
  });

  it("maps slug_taken to a 409 whose message names the slug", async () => {
    vi.mocked(repo.createFormConfig).mockResolvedValueOnce({ ok: false, reason: "slug_taken" });
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.forms.list,
      payload: { name: "contact", slug: "contact" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.toLowerCase()).toContain("slug");
  });
});

describe("GET /api/admin/forms/:name", () => {
  it("returns the form when it exists", async () => {
    vi.mocked(repo.getFormConfigByName).mockResolvedValueOnce(FORM);
    const res = await app.inject({ method: "GET", url: ENDPOINTS.admin.forms.detail("contact") });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("contact");
  });

  it("returns 404 for an unknown name", async () => {
    const res = await app.inject({ method: "GET", url: ENDPOINTS.admin.forms.detail("nope") });
    expect(res.statusCode).toBe(404);
  });
});

describe("PUT /api/admin/forms/:name", () => {
  it("saves a payload and returns the updated form", async () => {
    const res = await app.inject({
      method: "PUT",
      url: ENDPOINTS.admin.forms.detail("contact"),
      payload: { slug: "contact", rows: [], submissionConfig: { steps: [{ type: "store" }] } },
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(repo.saveFormConfigPayload)).toHaveBeenCalledWith("contact", {
      slug: "contact",
      rows: [],
      submissionConfig: { steps: [{ type: "store" }] },
    });
  });

  it("rejects a body without a rows array", async () => {
    const res = await app.inject({
      method: "PUT",
      url: ENDPOINTS.admin.forms.detail("contact"),
      payload: { slug: "contact" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("maps not_found to 404 and slug_taken to 409", async () => {
    vi.mocked(repo.saveFormConfigPayload).mockResolvedValueOnce({ ok: false, reason: "not_found" });
    const missing = await app.inject({
      method: "PUT",
      url: ENDPOINTS.admin.forms.detail("ghost"),
      payload: { rows: [] },
    });
    expect(missing.statusCode).toBe(404);

    vi.mocked(repo.saveFormConfigPayload).mockResolvedValueOnce({ ok: false, reason: "slug_taken" });
    const conflict = await app.inject({
      method: "PUT",
      url: ENDPOINTS.admin.forms.detail("contact"),
      payload: { slug: "taken", rows: [] },
    });
    expect(conflict.statusCode).toBe(409);
  });
});

describe("PATCH /api/admin/forms/:name", () => {
  it("toggles isActive", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.admin.forms.detail("contact"),
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(repo.setFormConfigActive)).toHaveBeenCalledWith("contact", false);
  });

  it("rejects a non-boolean isActive", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.admin.forms.detail("contact"),
      payload: { isActive: "yes" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown name", async () => {
    vi.mocked(repo.setFormConfigActive).mockResolvedValueOnce(null);
    const res = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.admin.forms.detail("ghost"),
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/admin/forms/:name", () => {
  it("deletes and confirms", async () => {
    const res = await app.inject({ method: "DELETE", url: ENDPOINTS.admin.forms.detail("contact") });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deleted: true });
  });

  it("returns 404 when nothing was deleted", async () => {
    vi.mocked(repo.deleteFormConfig).mockResolvedValueOnce(false);
    const res = await app.inject({ method: "DELETE", url: ENDPOINTS.admin.forms.detail("ghost") });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/admin/forms/import", () => {
  it("creates and fills a new form", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.forms.import,
      payload: { name: "imported", slug: "imported", rows: [] },
    });
    expect(res.statusCode).toBe(201);
    expect(vi.mocked(repo.createFormConfig)).toHaveBeenCalled();
    expect(vi.mocked(repo.saveFormConfigPayload)).toHaveBeenCalled();
  });

  it("refuses to overwrite an existing form without the overwrite flag", async () => {
    vi.mocked(repo.getFormConfigByName).mockResolvedValueOnce(FORM);
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.forms.import,
      payload: { name: "contact", rows: [] },
    });
    expect(res.statusCode).toBe(409);
  });

  it("overwrites an existing form when overwrite is set", async () => {
    vi.mocked(repo.getFormConfigByName).mockResolvedValueOnce(FORM);
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.forms.import,
      payload: { name: "contact", rows: [], overwrite: true },
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(repo.saveFormConfigPayload)).toHaveBeenCalledWith(
      "contact",
      expect.objectContaining({ rows: [] }),
    );
  });
});
