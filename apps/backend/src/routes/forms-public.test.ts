/**
 * @file Route tests for the public form-submit endpoint (MC-082). Repository
 * and pipeline are mocked; the route's own concerns are under test: the
 * active-only slug lookup (404), the submission-config guard (400), field
 * validation mapping (400 with issues), the success-config response, and the
 * per-route rate-limit configuration constant.
 */

import { ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminRepository } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";
import { executeSubmissionChain } from "../services/form-submission.js";
import formsPublicRoutes, { FORM_SUBMIT_RATE_LIMIT } from "./forms-public.js";

vi.mock("../db/index.js", () => ({
  getAdminRepository: vi.fn(),
}));

vi.mock("../services/form-submission.js", () => ({
  executeSubmissionChain: vi.fn(async () => undefined),
}));

const ACTIVE_FORM = {
  id: 5,
  name: "contact",
  slug: "contact",
  isActive: true,
  rows: [
    {
      id: "r1",
      fields: [{ id: "f1", name: "message", type: "textarea" as const, label: "Message", required: true }],
    },
  ],
  submissionConfig: {
    steps: [{ type: "store" as const }],
    successHeadline: "Thanks!",
    successMessage: "Got it.",
  },
};

function makeRepo(): AdminRepository {
  return {
    getActiveFormConfigBySlug: vi.fn(async () => null),
  } as unknown as AdminRepository;
}

let app: FastifyInstance;
let repo: AdminRepository;

beforeEach(async () => {
  vi.clearAllMocks();
  repo = makeRepo();
  vi.mocked(getAdminRepository).mockResolvedValue(repo);
  app = Fastify();
  await app.register(formsPublicRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("POST /api/v1/forms/:slug/submit", () => {
  it("404s for an unknown or inactive slug", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.v1.forms.submit("ghost"),
      payload: { message: "hi" },
    });
    expect(res.statusCode).toBe(404);
    expect(vi.mocked(executeSubmissionChain)).not.toHaveBeenCalled();
  });

  it("400s when the form has no submission config", async () => {
    vi.mocked(repo.getActiveFormConfigBySlug).mockResolvedValueOnce({ ...ACTIVE_FORM, submissionConfig: undefined });
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.v1.forms.submit("contact"),
      payload: { message: "hi" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("400s with per-field issues when validation fails", async () => {
    vi.mocked(repo.getActiveFormConfigBySlug).mockResolvedValueOnce(ACTIVE_FORM);
    const res = await app.inject({ method: "POST", url: ENDPOINTS.v1.forms.submit("contact"), payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0]?.field).toBe("message");
    expect(vi.mocked(executeSubmissionChain)).not.toHaveBeenCalled();
  });

  it("runs the pipeline with cleaned data and returns the success config", async () => {
    vi.mocked(repo.getActiveFormConfigBySlug).mockResolvedValueOnce(ACTIVE_FORM);
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.v1.forms.submit("contact"),
      payload: { message: "Hello", sneaky: "dropped" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, success: { headline: "Thanks!", message: "Got it." } });
    expect(vi.mocked(executeSubmissionChain)).toHaveBeenCalledWith(
      ACTIVE_FORM.submissionConfig,
      { message: "Hello" },
      { id: 5, name: "contact", rows: ACTIVE_FORM.rows },
    );
  });

  it("declares an hourly per-IP rate limit", () => {
    expect(FORM_SUBMIT_RATE_LIMIT).toEqual({ max: 20, timeWindow: "1 hour" });
  });
});
