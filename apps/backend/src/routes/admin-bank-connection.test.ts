/**
 * Route tests for the bank connection in the dashboard
 * (`/api/admin/sponsoring/bank-connection`), ported from lmaa.space
 * (`apps/backend/src/__tests__/admin-bank-connection-routes.test.ts`). They
 * drive the real handlers, the shared callback schema and the error contract
 * through `app.inject`, with the service, the configuration and the admin
 * lookup mocked.
 */
import jwt from "@fastify/jwt";
import { BANK_CONNECTION_BODY_LIMIT_BYTES, BankErrorCode, ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";
import { BankConnectionError } from "../services/bank-connection-error.js";

const mockAdminRepo = { findAdminById: vi.fn() };

vi.mock("../db/index.js", () => ({
  getAdminRepository: async () => mockAdminRepo,
}));

const serviceMocks = vi.hoisted(() => ({
  beginBankAuthorization: vi.fn(),
  completeBankAuthorization: vi.fn(),
  disconnectBank: vi.fn(),
  getBankConnectionStatus: vi.fn(),
}));

const configMocks = vi.hoisted(() => ({ isEnableBankingConfigured: vi.fn(() => true) }));

const ingestionMocks = vi.hoisted(() => ({ runBankIngestion: vi.fn() }));

vi.mock("../services/bank-connection.js", () => serviceMocks);
vi.mock("../lib/enable-banking-config.js", () => configMocks);
vi.mock("../services/bank-ingestion.js", () => ingestionMocks);

/** What a read that ran answers. */
const readResult = { ran: true, from: "2026-08-30", to: "2026-09-04", read: 3, imported: 1, filled: 0, skipped: 2 };

/** A value of the shape and length the site issues. */
const ISSUED = "a".repeat(64);

/** The status as the service hands it back. */
const disconnected = {
  configured: true,
  connected: false,
  institutionName: "",
  institutionCountry: "",
  consentValidUntil: null,
  connectedAt: null,
  lastReadAt: null,
  lastReadSucceeded: null,
  lastReadImported: 0,
  lastReadFilled: 0,
  lastReadFailure: null,
  nextReadAt: null,
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  configMocks.isEnableBankingConfigured.mockReturnValue(true);
  serviceMocks.getBankConnectionStatus.mockResolvedValue(disconnected);
  serviceMocks.beginBankAuthorization.mockResolvedValue({ url: "https://bank.example" });
  serviceMocks.completeBankAuthorization.mockResolvedValue({ ...disconnected, connected: true });
  serviceMocks.disconnectBank.mockResolvedValue(disconnected);
  ingestionMocks.runBankIngestion.mockResolvedValue(readResult);

  app = Fastify({ logger: false });
  registerApiErrorHandling(app);
  await app.register(jwt, { secret: "test-secret" });
  app.decorate("authenticateAdmin", async (request: FastifyRequest) => {
    await request.jwtVerify();
  });
  await app.register(async function adminRoutes(adminApp: FastifyInstance) {
    adminApp.addHook("preValidation", adminApp.authenticateAdmin);
    const { adminBankConnectionRoutes } = await import("./admin-bank-connection.js");
    await adminApp.register(adminBankConnectionRoutes);
    // A neighbor on the same scope, to show that nothing of the bank routes reaches it.
    adminApp.put("/api/admin/neighbor", async () => ({ saved: true }));
  });
});

afterEach(async () => {
  await app.close();
});

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

/**
 * Posts a return from the bank as the owner.
 *
 * @param body - The body to post.
 */
function postSession(body: unknown) {
  return send("POST", ENDPOINTS.admin.sponsoring.bankConnectionSession, "owner", body);
}

describe("the bank connection in the dashboard", () => {
  it("answers the status from the site's own database", async () => {
    const response = await send("GET", ENDPOINTS.admin.sponsoring.bankConnection, "admin");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(disconnected);
  });

  it("refuses the status to a role that does not keep the books", async () => {
    const response = await send("GET", ENDPOINTS.admin.sponsoring.bankConnection, "moderator");

    expect(response.statusCode).toBe(403);
    expect(serviceMocks.getBankConnectionStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["start an authorization", "POST", ENDPOINTS.admin.sponsoring.bankConnectionAuthorize, undefined],
    ["spend a return", "POST", ENDPOINTS.admin.sponsoring.bankConnectionSession, { code: "code-1", state: ISSUED }],
    ["disconnect", "DELETE", ENDPOINTS.admin.sponsoring.bankConnection, undefined],
    ["read the account", "POST", ENDPOINTS.admin.sponsoring.bankConnectionSync, {}],
  ] as const)("lets only the owner %s, because it reaches the bank account", async (_case, method, url, payload) => {
    const response = await send(method, url, "admin", payload);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "MC-AUTH-0002" });
    expect(serviceMocks.beginBankAuthorization).not.toHaveBeenCalled();
    expect(serviceMocks.completeBankAuthorization).not.toHaveBeenCalled();
    expect(serviceMocks.disconnectBank).not.toHaveBeenCalled();
    expect(ingestionMocks.runBankIngestion).not.toHaveBeenCalled();
  });

  it("refuses an admin before reading the body, so the schema never answers them", async () => {
    const response = await send("POST", ENDPOINTS.admin.sponsoring.bankConnectionSession, "admin", { code: "<x>" });

    expect(response.statusCode).toBe(403);
  });

  it("refuses a body larger than the bank routes take", async () => {
    const response = await postSession({ code: "x".repeat(BANK_CONNECTION_BODY_LIMIT_BYTES * 2), state: ISSUED });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ error: "MC-REQ-0001" });
    expect(serviceMocks.completeBankAuthorization).not.toHaveBeenCalled();
  });

  it("keeps the owner check and the size limit off the routes beside it", async () => {
    const response = await send("PUT", "/api/admin/neighbor", "admin", {
      rows: "x".repeat(BANK_CONNECTION_BODY_LIMIT_BYTES * 2),
    });

    expect(response.statusCode).toBe(200);
  });

  it("hands out the address to send the browser to", async () => {
    const response = await send("POST", ENDPOINTS.admin.sponsoring.bankConnectionAuthorize, "owner");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ url: "https://bank.example" });
  });

  it("lets the account go without being told which one", async () => {
    const response = await send("DELETE", ENDPOINTS.admin.sponsoring.bankConnection, "owner");

    expect(response.statusCode).toBe(200);
    // No identifier reaches the service, only the request's logger, so nothing
    // could point at a connection other than the one in force.
    expect(serviceMocks.disconnectBank).toHaveBeenCalledWith(expect.objectContaining({ info: expect.any(Function) }));
    expect(response.json()).toEqual(disconnected);
  });

  it("answers a refusal of the service with its own code, message and error id", async () => {
    serviceMocks.disconnectBank.mockRejectedValue(new BankConnectionError(BankErrorCode.CloseFailed));

    const response = await send("DELETE", ENDPOINTS.admin.sponsoring.bankConnection, "owner");

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: BankErrorCode.CloseFailed,
      message: expect.stringContaining(`(${BankErrorCode.CloseFailed})`),
      errorId: expect.any(String),
    });
  });

  describe("without a credential", () => {
    beforeEach(() => {
      configMocks.isEnableBankingConfigured.mockReturnValue(false);
    });

    it("refuses to start an authorization", async () => {
      const response = await send("POST", ENDPOINTS.admin.sponsoring.bankConnectionAuthorize, "owner");

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ error: BankErrorCode.NotConfigured, errorId: expect.any(String) });
      expect(serviceMocks.beginBankAuthorization).not.toHaveBeenCalled();
    });

    it("refuses to spend a return", async () => {
      const response = await postSession({ code: "code-1", state: ISSUED });

      expect(response.statusCode).toBe(503);
      expect(serviceMocks.completeBankAuthorization).not.toHaveBeenCalled();
    });

    it("refuses to disconnect, because closing needs the same credential", async () => {
      const response = await send("DELETE", ENDPOINTS.admin.sponsoring.bankConnection, "owner");

      expect(response.statusCode).toBe(503);
      expect(serviceMocks.disconnectBank).not.toHaveBeenCalled();
    });

    it("still answers the status", async () => {
      const response = await send("GET", ENDPOINTS.admin.sponsoring.bankConnection, "owner");

      expect(response.statusCode).toBe(200);
    });

    it("refuses to read the account", async () => {
      const response = await send("POST", ENDPOINTS.admin.sponsoring.bankConnectionSync, "owner", {});

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ error: BankErrorCode.NotConfigured, errorId: expect.any(String) });
      expect(ingestionMocks.runBankIngestion).not.toHaveBeenCalled();
    });
  });

  describe("reading the account now", () => {
    it("reads the days the read takes by itself, as the owner asking", async () => {
      const response = await send("POST", ENDPOINTS.admin.sponsoring.bankConnectionSync, "owner", {});

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(readResult);
      expect(ingestionMocks.runBankIngestion).toHaveBeenCalledWith(
        "manual",
        {},
        expect.objectContaining({ info: expect.any(Function) }),
      );
    });

    it("takes its body as an object, so a request without one is refused", async () => {
      const response = await send("POST", ENDPOINTS.admin.sponsoring.bankConnectionSync, "owner");

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "MC-REQ-0001" });
      expect(ingestionMocks.runBankIngestion).not.toHaveBeenCalled();
    });

    it("starts at the day it was given", async () => {
      await send("POST", ENDPOINTS.admin.sponsoring.bankConnectionSync, "owner", { from: "2026-06-01" });

      expect(ingestionMocks.runBankIngestion).toHaveBeenCalledWith("manual", { from: "2026-06-01" }, expect.anything());
    });

    it("answers a read that did nothing as an ordinary answer", async () => {
      ingestionMocks.runBankIngestion.mockResolvedValue({ ran: false, reason: "budget_spent" });

      const response = await send("POST", ENDPOINTS.admin.sponsoring.bankConnectionSync, "owner", {});

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ran: false, reason: "budget_spent" });
    });

    it.each([
      ["a day that does not exist", { from: "2026-02-30" }],
      ["a day in another shape", { from: "1.6.2026" }],
      ["a day that is not text", { from: 20260601 }],
      ["anything else in the body", { from: "2026-06-01", to: "2026-06-30" }],
    ])("is refused for %s", async (_case, body) => {
      const response = await send("POST", ENDPOINTS.admin.sponsoring.bankConnectionSync, "owner", body);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "MC-REQ-0001", errorId: expect.any(String) });
      expect(ingestionMocks.runBankIngestion).not.toHaveBeenCalled();
    });

    it("refuses a body larger than the bank routes take", async () => {
      const response = await send("POST", ENDPOINTS.admin.sponsoring.bankConnectionSync, "owner", {
        from: "x".repeat(BANK_CONNECTION_BODY_LIMIT_BYTES * 2),
      });

      expect(response.statusCode).toBe(413);
      expect(ingestionMocks.runBankIngestion).not.toHaveBeenCalled();
    });
  });

  describe("the return from the bank", () => {
    it("is spent when both halves are there", async () => {
      const response = await postSession({ code: "code-1", state: ISSUED });

      expect(response.statusCode).toBe(200);
      expect(serviceMocks.completeBankAuthorization).toHaveBeenCalledWith("code-1", ISSUED, expect.anything());
    });

    it("is spent without the whitespace around either half", async () => {
      await postSession({ code: "  code-1 ", state: ` ${ISSUED}\n` });

      expect(serviceMocks.completeBankAuthorization).toHaveBeenCalledWith("code-1", ISSUED, expect.anything());
    });

    it.each([
      ["without a state", { code: "code-1" }],
      ["without a code", { state: ISSUED }],
      ["when the state is not the length this site issues", { code: "code-1", state: "a".repeat(63) }],
      ["when the state is not hexadecimal", { code: "code-1", state: "z".repeat(64) }],
      ["when the code carries characters an authorization code cannot", { code: "<script>", state: ISSUED }],
      ["when the code is longer than an authorization code may be", { code: "c".repeat(513), state: ISSUED }],
      ["when the code is empty", { code: "", state: ISSUED }],
      ["when the body carries anything else", { code: "code-1", state: ISSUED, role: "owner" }],
    ])("is refused %s", async (_case, body) => {
      const response = await postSession(body);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "MC-REQ-0001" });
      expect(serviceMocks.completeBankAuthorization).not.toHaveBeenCalled();
    });

    it("is refused with its own code when no start of this site matches it", async () => {
      serviceMocks.completeBankAuthorization.mockRejectedValue(new BankConnectionError(BankErrorCode.StateUnknown));

      const response = await postSession({ code: "code-1", state: ISSUED });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: BankErrorCode.StateUnknown });
    });
  });
});
