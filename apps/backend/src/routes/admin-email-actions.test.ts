/**
 * @file Route tests for the bind-time compatibility gate in
 * `admin-email-actions.ts` (MC-081): a template may be bound to an action iff
 * every `{{var}}` it uses is available for that action — system scope,
 * recipient scope (per the action's `recipientKind`), or one of the action's
 * declared context variables. Exercised through `app.inject` against a bare
 * Fastify instance with only the routes under test registered (the admin-auth
 * preHandler lives in `server.ts`'s `adminRoutes` block, not in the route
 * module, so no auth plumbing is needed here). The template service module is
 * mocked; the gate logic itself runs for real.
 */

import { EmailBlockType, ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createManagedEmailActionBinding,
  getManagedEmailTemplateById,
  listManagedEmailActionBindings,
} from "../services/email-templates.js";
import adminEmailActionsRoutes from "./admin-email-actions.js";

vi.mock("../services/email-templates.js", () => ({
  listManagedEmailActionBindings: vi.fn(async () => []),
  getManagedEmailTemplateById: vi.fn(async () => ({ ok: false })),
  createManagedEmailActionBinding: vi.fn(async () => ({
    id: "bind-1",
    actionKey: "adminInviteSent",
    templateId: 1,
    enabled: true,
  })),
  setManagedEmailActionBindingEnabled: vi.fn(async () => null),
  deleteManagedEmailActionBinding: vi.fn(async () => false),
}));

/**
 * Builds the minimal template-service DTO the bind route reads: name for the
 * error message, subject + blocks for the auto-extracted variable set.
 */
function makeTemplate(subject: string, markdown: string) {
  return {
    ok: true as const,
    data: {
      id: 1,
      name: "Test template",
      subject,
      blocks: [{ type: EmailBlockType.Text, markdown }],
    },
  };
}

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  app = Fastify();
  await app.register(adminEmailActionsRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("POST /api/admin/email-actions/bindings (bind-time gate)", () => {
  it("accepts a template that uses only system- and recipient-scope variables", async () => {
    // `websiteUrl` is a system variable: no action declares it, it is simply
    // always available — binding must succeed for any action.
    vi.mocked(getManagedEmailTemplateById).mockResolvedValueOnce(
      makeTemplate("Hi {{username}}", "See {{websiteUrl}}") as never,
    );

    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.emailActions.bindings,
      payload: { actionKey: "adminInviteSent", templateId: 1 },
    });

    expect(res.statusCode).toBe(201);
    expect(vi.mocked(createManagedEmailActionBinding)).toHaveBeenCalledWith({
      actionKey: "adminInviteSent",
      templateId: 1,
    });
  });

  it("rejects a template that uses another action's context variable", async () => {
    vi.mocked(getManagedEmailTemplateById).mockResolvedValueOnce(
      makeTemplate("Verify", "Click {{verifyUrl}}") as never,
    );

    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.emailActions.bindings,
      payload: { actionKey: "adminInviteSent", templateId: 1 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/verifyUrl/);
    expect(vi.mocked(createManagedEmailActionBinding)).not.toHaveBeenCalled();
  });

  it("rejects an admin-only recipient variable for a developer-account action", async () => {
    // `role` resolves only for admin users; developerVerificationRequested
    // addresses developer accounts, so the pairing must be rejected.
    vi.mocked(getManagedEmailTemplateById).mockResolvedValueOnce(
      makeTemplate("Hi {{username}}", "Your role: {{role}}") as never,
    );

    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.emailActions.bindings,
      payload: { actionKey: "developerVerificationRequested", templateId: 1 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/role/);
    expect(vi.mocked(createManagedEmailActionBinding)).not.toHaveBeenCalled();
  });

  it("lists bindings for every registry action via GET", async () => {
    vi.mocked(listManagedEmailActionBindings).mockResolvedValue([]);

    const res = await app.inject({ method: "GET", url: ENDPOINTS.admin.emailActions.list });

    expect(res.statusCode).toBe(200);
    const keys = res.json().map((action: { key: string }) => action.key);
    expect(keys).toEqual(
      expect.arrayContaining(["adminInviteSent", "developerVerificationRequested", "developerPasswordResetRequested"]),
    );
  });
});
