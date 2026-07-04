/**
 * @file Route tests for the admin GDPR tooling (MC-085): export a subject's
 * personal-data package by email, and erase (anonymise) an account-less
 * subject's data by email — a developer account behind the address yields
 * `409 ACCOUNT_EXISTS` (account deletion stays owner-only in the danger
 * zone). GDPR services, the developer repo and the owner/admin guard are
 * mocked; route validation and status mapping are under test.
 */

import { ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDeveloperRepository } from "../db/index.js";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { erasePersonalData } from "../services/gdpr-erase.js";
import { buildPersonalDataExport } from "../services/gdpr-export.js";
import adminGdprRoutes from "./admin-gdpr.js";

vi.mock("../db/index.js", () => ({
  getDeveloperRepository: vi.fn(),
}));

vi.mock("../lib/admin-caller.js", () => ({
  requireOwnerOrAdmin: vi.fn(async () => ({ id: "admin-1", role: "admin" })),
}));

vi.mock("../services/gdpr-export.js", () => ({
  buildPersonalDataExport: vi.fn(async () => ({
    version: 1,
    exportedAt: "2026-07-04T00:00:00.000Z",
    subject: { email: "person@example.com" },
    formSubmissions: [],
  })),
}));

vi.mock("../services/gdpr-erase.js", () => ({
  erasePersonalData: vi.fn(async () => ({ anonymizedSubmissions: 3, accountDeleted: false })),
}));

const developerRepo = {
  findDeveloperAccountByEmail: vi.fn(async () => null),
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(getDeveloperRepository).mockResolvedValue(developerRepo as never);
  app = Fastify();
  await app.register(adminGdprRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("GET /api/admin/gdpr/export", () => {
  it("exports the subject's package by email, resolving an existing account", async () => {
    developerRepo.findDeveloperAccountByEmail.mockResolvedValueOnce({
      id: "dev-acc-1",
      email: "person@example.com",
    } as never);

    const res = await app.inject({
      method: "GET",
      url: `${ENDPOINTS.admin.gdpr.export}?email=Person@Example.com`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().version).toBe(1);
    expect(vi.mocked(buildPersonalDataExport)).toHaveBeenCalledWith({
      developerAccountId: "dev-acc-1",
      email: "person@example.com",
    });
  });

  it("exports an account-less subject with the email only", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${ENDPOINTS.admin.gdpr.export}?email=person@example.com`,
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(buildPersonalDataExport)).toHaveBeenCalledWith({ email: "person@example.com" });
  });

  it("rejects a missing or invalid email with 400", async () => {
    const res = await app.inject({ method: "GET", url: ENDPOINTS.admin.gdpr.export });
    expect(res.statusCode).toBe(400);
  });

  it("returns nothing when the guard already rejected", async () => {
    vi.mocked(requireOwnerOrAdmin).mockResolvedValueOnce(null);
    await app.inject({ method: "GET", url: `${ENDPOINTS.admin.gdpr.export}?email=x@y.zz` });
    expect(vi.mocked(buildPersonalDataExport)).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/gdpr/erase", () => {
  it("anonymises an account-less subject's data", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.gdpr.erase,
      payload: { email: "person@example.com" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ anonymizedSubmissions: 3, accountDeleted: false });
    expect(vi.mocked(erasePersonalData)).toHaveBeenCalledWith({ email: "person@example.com" });
  });

  it("refuses with 409 ACCOUNT_EXISTS when a developer account owns the address", async () => {
    developerRepo.findDeveloperAccountByEmail.mockResolvedValueOnce({ id: "dev-acc-1" } as never);

    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.gdpr.erase,
      payload: { email: "person@example.com" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("ACCOUNT_EXISTS");
    expect(vi.mocked(erasePersonalData)).not.toHaveBeenCalled();
  });

  it("rejects a missing email with 400", async () => {
    const res = await app.inject({ method: "POST", url: ENDPOINTS.admin.gdpr.erase, payload: {} });
    expect(res.statusCode).toBe(400);
  });
});
