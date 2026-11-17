/**
 * Route tests for the support prompts' admin surface
 * (`/api/admin/support-prompts`). Drives the real handlers and the real request
 * schemas through `app.inject`, with the prompts, the limits and the admin
 * lookup mocked.
 *
 * Every dashboard role carries the JWT claim `role: "admin"`, so the role that
 * matters comes from the mocked admin record, as it does in production.
 */
import jwt from "@fastify/jwt";
import {
  ENDPOINTS,
  SUPPORT_PROMPT_DEFAULTS,
  SUPPORT_PROMPT_LIMIT_DEFAULTS,
  type SupportPrompt,
  type SupportPromptInput,
} from "@musiccloud/shared";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

const mockAdminRepo = { findAdminById: vi.fn() };

vi.mock("../db/index.js", () => ({
  getAdminRepository: async () => mockAdminRepo,
}));

const promptMocks = vi.hoisted(() => ({
  listSupportPrompts: vi.fn(),
  getSupportPrompt: vi.fn(),
  insertSupportPrompt: vi.fn(),
  updateSupportPrompt: vi.fn(),
  deleteSupportPrompt: vi.fn(),
}));
vi.mock("../services/support-prompts.js", () => promptMocks);

const limitMocks = vi.hoisted(() => ({ getSupportPromptLimits: vi.fn(), putSupportPromptLimits: vi.fn() }));
vi.mock("../services/support-prompt-limits.js", () => limitMocks);

/** A prompt id of the shape the store issues. */
const PROMPT_ID = "V1StGXR8_Z5jdHi6B-myT";

/** The two fields a prompt cannot do without. */
const MINIMAL = { name: "Third share", slot: "share-page" } as const;

/** The stored prompt the mocks answer with. */
const STORED: SupportPrompt = {
  ...SUPPORT_PROMPT_DEFAULTS,
  ...MINIMAL,
  id: PROMPT_ID,
  updatedAt: "2026-11-17T00:00:00.000Z",
};

let app: FastifyInstance;

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  registerApiErrorHandling(instance);
  await instance.register(jwt, { secret: "test-secret" });
  instance.decorate("authenticateAdmin", async (request: FastifyRequest) => {
    await request.jwtVerify();
  });
  await instance.register(async function adminRoutes(adminApp: FastifyInstance) {
    adminApp.addHook("preValidation", adminApp.authenticateAdmin);
    const { adminSupportPromptRoutes } = await import("./admin-support-prompts.js");
    await adminApp.register(adminSupportPromptRoutes);
  });
  return instance;
}

/**
 * Sends a request as a dashboard user of the given role.
 *
 * @param method - The HTTP method.
 * @param url - The path.
 * @param role - The role stored for the caller.
 * @param payload - The body, if any.
 */
function send(method: "GET" | "POST" | "PUT" | "DELETE", url: string, role: string, payload?: unknown) {
  mockAdminRepo.findAdminById.mockResolvedValue({ id: "admin-1", role });
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${app.jwt.sign({ sub: "admin-1", role: "admin" })}` },
    ...(payload === undefined ? {} : { payload: payload as never }),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  promptMocks.insertSupportPrompt.mockImplementation(async (input: SupportPromptInput) => ({ ...STORED, ...input }));
  promptMocks.updateSupportPrompt.mockImplementation(async (_id: string, input: SupportPromptInput) => ({
    ...STORED,
    ...input,
  }));
  app = await buildApp();
});

describe("GET /api/admin/support-prompts", () => {
  it("answers an admin with every prompt", async () => {
    promptMocks.listSupportPrompts.mockResolvedValue([STORED]);

    const res = await send("GET", ENDPOINTS.admin.supportPrompts.list, "admin");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([STORED]);
  });

  it("refuses a moderator, because prompts are configuration", async () => {
    const res = await send("GET", ENDPOINTS.admin.supportPrompts.list, "moderator");

    expect(res.statusCode).toBe(403);
    expect(promptMocks.listSupportPrompts).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/support-prompts", () => {
  it("fills every field it was not given from the defaults", async () => {
    const res = await send("POST", ENDPOINTS.admin.supportPrompts.list, "owner", MINIMAL);

    expect(res.statusCode).toBe(200);
    expect(promptMocks.insertSupportPrompt).toHaveBeenCalledWith({ ...SUPPORT_PROMPT_DEFAULTS, ...MINIMAL });
  });

  it("trims what it stores", async () => {
    await send("POST", ENDPOINTS.admin.supportPrompts.list, "admin", {
      ...MINIMAL,
      name: "  Third share  ",
      buttonLabel: " Support ",
      buttonHref: " /support-me ",
    });

    expect(promptMocks.insertSupportPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Third share", buttonLabel: "Support", buttonHref: "/support-me" }),
    );
  });

  it("refuses a moderator and writes nothing", async () => {
    const res = await send("POST", ENDPOINTS.admin.supportPrompts.list, "moderator", MINIMAL);

    expect(res.statusCode).toBe(403);
    expect(promptMocks.insertSupportPrompt).not.toHaveBeenCalled();
  });

  it.each([
    ["a blank name", { name: "   " }, "MC-REQ-0001"],
    ["a destination that runs script", { buttonHref: "javascript:alert(1)" }, "MC-REQ-0014"],
    ["a protocol-relative destination", { buttonHref: "//example.com" }, "MC-REQ-0014"],
    ["a plain http destination", { buttonHref: "http://example.com" }, "MC-REQ-0014"],
    ["an empty destination without a caption, as lmaa refuses it", { buttonHref: "" }, "MC-REQ-0014"],
    ["a caption with an empty destination", { buttonLabel: "Support", buttonHref: "  " }, "MC-REQ-0015"],
    ["a window that ends before it starts", { startsAt: "2026-12-01", endsAt: "2026-11-30" }, "MC-REQ-0016"],
    ["an unknown slot", { slot: "my-shops" }, "MC-REQ-0001"],
    ["a day that is not a day", { startsAt: "1 December" }, "MC-REQ-0001"],
    ["a first day that does not exist", { startsAt: "2026-13-45" }, "MC-REQ-0001"],
    ["a last day that does not exist", { endsAt: "2026-02-30" }, "MC-REQ-0001"],
    ["a threshold above 500", { threshold: 501 }, "MC-REQ-0001"],
    ["a priority above 1000", { priority: 1001 }, "MC-REQ-0001"],
    ["a name above 120 characters", { name: "x".repeat(121) }, "MC-REQ-0001"],
  ])("refuses %s and writes nothing", async (_case, change, code) => {
    const res = await send("POST", ENDPOINTS.admin.supportPrompts.list, "owner", { ...MINIMAL, ...change });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe(code);
    expect(promptMocks.insertSupportPrompt).not.toHaveBeenCalled();
  });

  it("accepts an https destination and a window of one day", async () => {
    const res = await send("POST", ENDPOINTS.admin.supportPrompts.list, "owner", {
      ...MINIMAL,
      buttonHref: "https://musiccloud.io/support-me",
      startsAt: "2026-12-01",
      endsAt: "2026-12-01",
    });

    expect(res.statusCode).toBe(200);
  });

  it("does not store a field the schema does not know", async () => {
    await send("POST", ENDPOINTS.admin.supportPrompts.list, "owner", { ...MINIMAL, id: "chosen" });

    expect(promptMocks.insertSupportPrompt.mock.calls[0][0]).not.toHaveProperty("id");
  });
});

describe("/api/admin/support-prompts/:id", () => {
  it("answers one prompt", async () => {
    promptMocks.getSupportPrompt.mockResolvedValue(STORED);

    const res = await send("GET", ENDPOINTS.admin.supportPrompts.detail(PROMPT_ID), "admin");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(STORED);
  });

  it("answers a prompt that does not exist with MC-RES-0003", async () => {
    promptMocks.getSupportPrompt.mockResolvedValue(null);
    promptMocks.updateSupportPrompt.mockResolvedValue(null);
    promptMocks.deleteSupportPrompt.mockResolvedValue(false);

    for (const method of ["GET", "PUT", "DELETE"] as const) {
      const res = await send(
        method,
        ENDPOINTS.admin.supportPrompts.detail(PROMPT_ID),
        "admin",
        method === "PUT" ? MINIMAL : undefined,
      );
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("MC-RES-0003");
    }
  });

  it("saves under the same identifier, so nobody's counters reset", async () => {
    const res = await send("PUT", ENDPOINTS.admin.supportPrompts.detail(PROMPT_ID), "admin", {
      ...MINIMAL,
      published: true,
    });

    expect(res.statusCode).toBe(200);
    expect(promptMocks.updateSupportPrompt).toHaveBeenCalledWith(
      PROMPT_ID,
      expect.objectContaining({ published: true }),
    );
  });

  it("refuses an identifier that could name another path", async () => {
    const res = await send("GET", ENDPOINTS.admin.supportPrompts.detail("../limits"), "admin");

    expect(res.statusCode).toBe(400);
    expect(promptMocks.getSupportPrompt).not.toHaveBeenCalled();
  });

  it("removes one prompt", async () => {
    promptMocks.deleteSupportPrompt.mockResolvedValue(true);

    const res = await send("DELETE", ENDPOINTS.admin.supportPrompts.detail(PROMPT_ID), "owner");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: "Support prompt deleted" });
  });
});

describe("/api/admin/support-prompts/limits", () => {
  it("answers the limits", async () => {
    limitMocks.getSupportPromptLimits.mockResolvedValue(SUPPORT_PROMPT_LIMIT_DEFAULTS);

    const res = await send("GET", ENDPOINTS.admin.supportPrompts.limits, "admin");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(SUPPORT_PROMPT_LIMIT_DEFAULTS);
  });

  it("stores the defaults for an empty body", async () => {
    const res = await send("PUT", ENDPOINTS.admin.supportPrompts.limits, "admin", {});

    expect(res.statusCode).toBe(200);
    expect(limitMocks.putSupportPromptLimits).toHaveBeenCalledWith(SUPPORT_PROMPT_LIMIT_DEFAULTS);
  });

  it.each([
    ["maxShown", 0],
    ["maxShown", 21],
    ["snoozeDays", -1],
    ["snoozeDays", 366],
    ["dismissSnoozeDays", 366],
    ["dismissalsUntilResolved", 0],
    ["dismissalsUntilResolved", 11],
  ])("refuses %s of %d and writes nothing", async (field, value) => {
    const res = await send("PUT", ENDPOINTS.admin.supportPrompts.limits, "admin", { [field]: value });

    expect(res.statusCode).toBe(400);
    expect(limitMocks.putSupportPromptLimits).not.toHaveBeenCalled();
  });

  it("refuses a moderator", async () => {
    const res = await send("PUT", ENDPOINTS.admin.supportPrompts.limits, "moderator", {});

    expect(res.statusCode).toBe(403);
    expect(limitMocks.putSupportPromptLimits).not.toHaveBeenCalled();
  });
});
