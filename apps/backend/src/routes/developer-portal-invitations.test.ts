import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import {
  ENDPOINTS,
  INVITATION_PASS_COOKIE_NAME,
  type PortalInvitation,
  PortalInvitationNext,
  PortalInvitationRefusal,
  PortalInvitationState,
} from "@musiccloud/shared";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";
import { issueInvitationPass, SESSION_COOKIE_NAME } from "../services/developer-auth.js";

const mocks = vi.hoisted(() => ({
  findAdminById: vi.fn(),
  listPortalInvitations: vi.fn(),
  invitePortalDeveloper: vi.fn(),
  resendPortalInvitation: vi.fn(),
  withdrawPortalInvitation: vi.fn(),
  redeemPortalInvitation: vi.fn(),
  bindPortalInvitation: vi.fn(),
  readOpenPortalInvitationPass: vi.fn(),
  resolveDeveloperSession: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  getAdminRepository: vi.fn(async () => ({ findAdminById: mocks.findAdminById })),
}));

vi.mock("../services/developer-portal-invitations.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/developer-portal-invitations.js")>()),
  listPortalInvitations: mocks.listPortalInvitations,
  invitePortalDeveloper: mocks.invitePortalDeveloper,
  resendPortalInvitation: mocks.resendPortalInvitation,
  withdrawPortalInvitation: mocks.withdrawPortalInvitation,
  redeemPortalInvitation: mocks.redeemPortalInvitation,
  bindPortalInvitation: mocks.bindPortalInvitation,
  readOpenPortalInvitationPass: mocks.readOpenPortalInvitationPass,
}));

vi.mock("../services/developer-session.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/developer-session.js")>()),
  resolveDeveloperSession: mocks.resolveDeveloperSession,
}));

const { PortalInvitationMailError } = await import("../services/developer-portal-invitations.js");
const { developerPortalInvitationAdminRoutes, developerPortalInvitationInternalRoutes, devPortalInvitationRoutes } =
  await import("./developer-portal-invitations.js");

const JWT_SECRET = "test-portal-invitation-secret";
const TOKEN = "a".repeat(43);

const openInvitation: PortalInvitation = {
  id: "inv-1",
  email: "new@example.com",
  state: PortalInvitationState.Open,
  createdAt: "2026-10-12T10:00:00.000Z",
  sentAt: "2026-10-12T10:00:00.000Z",
  expiresAt: "2026-10-26T10:00:00.000Z",
  usedAt: null,
  withdrawnAt: null,
  account: null,
  sentBy: "olive",
};

async function createApp() {
  const app = Fastify();
  registerApiErrorHandling(app);
  await app.register(jwt, { secret: JWT_SECRET });
  await app.register(cookie);
  app.decorate("authenticateAdmin", async (request) => {
    request.user = { sub: "owner-1", role: "admin" };
  });
  app.decorate("authenticateInternal", async () => undefined);
  await app.register(async (adminApp) => {
    adminApp.addHook("preValidation", adminApp.authenticateAdmin);
    await adminApp.register(developerPortalInvitationAdminRoutes);
  });
  await app.register(devPortalInvitationRoutes);
  await app.register(async (internalApp) => {
    internalApp.addHook("preValidation", internalApp.authenticateInternal);
    await internalApp.register(developerPortalInvitationInternalRoutes);
  });
  await app.ready();
  return app;
}

/** The `Set-Cookie` line that sets the pass, or `undefined`. */
function passCookie(headers: Record<string, unknown>): string | undefined {
  const raw = headers["set-cookie"];
  const lines = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return lines.find((line) => line.startsWith(`${INVITATION_PASS_COOKIE_NAME}=`));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findAdminById.mockResolvedValue({ id: "owner-1", role: "owner" });
  mocks.resolveDeveloperSession.mockResolvedValue({ refusal: "missing" });
});

describe("the owner's invitation routes", () => {
  it("lists the invitations", async () => {
    mocks.listPortalInvitations.mockResolvedValue([openInvitation]);
    const app = await createApp();

    const response = await app.inject({ method: "GET", url: ENDPOINTS.admin.developer.portalInvitations });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ invitations: [openInvitation] });
  });

  it("invites the address as it is stored, in the name of the owner who sent it", async () => {
    mocks.invitePortalDeveloper.mockResolvedValue(openInvitation);
    const app = await createApp();

    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.portalInvitations,
      payload: { email: "  New@Example.com " },
    });

    expect(response.statusCode).toBe(201);
    expect(mocks.invitePortalDeveloper).toHaveBeenCalledWith("new@example.com", "owner-1");
    expect(response.json()).toEqual({ invitation: openInvitation });
  });

  it.each(["admin", "moderator"])("refuses a %s, who may not decide who enters", async (role) => {
    mocks.findAdminById.mockResolvedValue({ id: "owner-1", role });
    const app = await createApp();

    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.portalInvitations,
      payload: { email: "new@example.com" },
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.invitePortalDeveloper).not.toHaveBeenCalled();
  });

  it("refuses a string that cannot be an address", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.portalInvitations,
      payload: { email: "not an address" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "MC-REQ-0006" });
  });

  it("says nothing was stored when the mail could not be sent", async () => {
    mocks.invitePortalDeveloper.mockRejectedValue(new PortalInvitationMailError(new Error("no template bound")));
    const app = await createApp();

    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.portalInvitations,
      payload: { email: "new@example.com" },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: "MC-SYS-0003", errorId: expect.any(String) });
  });

  it("sends only an invitation that exists and is open again", async () => {
    const app = await createApp();

    mocks.resendPortalInvitation.mockResolvedValueOnce({ missing: true });
    const missing = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.portalInvitationResend("inv-9"),
    });
    mocks.resendPortalInvitation.mockResolvedValueOnce({ notOpen: true });
    const notOpen = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.portalInvitationResend("inv-1"),
    });
    mocks.resendPortalInvitation.mockResolvedValueOnce({ invitation: openInvitation });
    const resent = await app.inject({ method: "POST", url: ENDPOINTS.admin.developer.portalInvitationResend("inv-1") });

    expect(missing.statusCode).toBe(404);
    expect(notOpen.statusCode).toBe(409);
    expect(notOpen.json()).toMatchObject({ error: "MC-REQ-0002" });
    expect(resent.statusCode).toBe(200);
    expect(resent.json()).toEqual({ invitation: openInvitation });
  });

  it("withdraws an invitation, and says when there is none", async () => {
    const app = await createApp();

    mocks.withdrawPortalInvitation.mockResolvedValueOnce(null);
    const missing = await app.inject({
      method: "DELETE",
      url: ENDPOINTS.admin.developer.portalInvitationDetail("inv-9"),
    });
    const withdrawn = { ...openInvitation, state: PortalInvitationState.Withdrawn };
    mocks.withdrawPortalInvitation.mockResolvedValueOnce(withdrawn);
    const found = await app.inject({
      method: "DELETE",
      url: ENDPOINTS.admin.developer.portalInvitationDetail("inv-1"),
    });

    expect(missing.statusCode).toBe(404);
    expect(found.json()).toEqual({ invitation: withdrawn });
  });
});

describe("redeeming an invitation link", () => {
  it("says why a link no longer works", async () => {
    mocks.redeemPortalInvitation.mockResolvedValue({ refusal: PortalInvitationRefusal.Expired });
    const app = await createApp();

    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.redeemInvitation,
      payload: { token: TOKEN },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ error: "MC-REQ-0008", reason: PortalInvitationRefusal.Expired });
    expect(passCookie(response.headers)).toBeUndefined();
  });

  it("hands somebody who is not signed in the pass that opens sign-up", async () => {
    mocks.redeemPortalInvitation.mockResolvedValue({
      invitation: { id: "inv-1", email: "new@example.com", accountId: null },
    });
    const app = await createApp();

    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.redeemInvitation,
      payload: { token: TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ next: PortalInvitationNext.SignUp, email: "new@example.com" });
    const pass = passCookie(response.headers);
    expect(pass).toMatch(/HttpOnly/);
    expect(pass).toMatch(/Max-Age=86400/);
    expect(mocks.bindPortalInvitation).not.toHaveBeenCalled();
  });

  it("writes the grant onto the account of somebody signed in, with no pass", async () => {
    mocks.redeemPortalInvitation.mockResolvedValue({
      invitation: { id: "inv-1", email: "new@example.com", accountId: null },
    });
    mocks.resolveDeveloperSession.mockResolvedValue({ account: { id: "acc-7" } });
    const app = await createApp();

    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.redeemInvitation,
      payload: { token: TOKEN },
      cookies: { [SESSION_COOKIE_NAME]: "session-token" },
    });

    expect(response.json()).toEqual({ next: PortalInvitationNext.Dashboard, email: "new@example.com" });
    expect(mocks.bindPortalInvitation).toHaveBeenCalledWith("inv-1", "acc-7");
    expect(passCookie(response.headers)).toBeUndefined();
  });

  it("sends somebody whose address already had an account to sign in with it", async () => {
    mocks.redeemPortalInvitation.mockResolvedValue({
      invitation: { id: "inv-1", email: "known@example.com", accountId: "acc-1" },
    });
    const app = await createApp();

    const signedOut = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.redeemInvitation,
      payload: { token: TOKEN },
    });
    mocks.resolveDeveloperSession.mockResolvedValue({ account: { id: "acc-1" } });
    const signedIn = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.redeemInvitation,
      payload: { token: TOKEN },
      cookies: { [SESSION_COOKIE_NAME]: "session-token" },
    });

    expect(signedOut.json()).toEqual({ next: PortalInvitationNext.SignIn, email: "known@example.com" });
    expect(signedIn.json()).toEqual({ next: PortalInvitationNext.Dashboard, email: "known@example.com" });
    expect(passCookie(signedOut.headers)).toBeUndefined();
    expect(mocks.bindPortalInvitation).not.toHaveBeenCalled();
  });

  it("refuses a token that is not shaped like one before looking it up", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.redeemInvitation,
      payload: { token: "../../etc" },
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.redeemPortalInvitation).not.toHaveBeenCalled();
  });
});

describe("the gate's question about a pass", () => {
  it("answers yes only for a pass this backend signed whose invitation is still unbound", async () => {
    const app = await createApp();
    const pass = issueInvitationPass("inv-1", (payload, options) => app.jwt.sign(payload, options)).token;

    mocks.readOpenPortalInvitationPass.mockResolvedValueOnce({ email: "new@example.com" });
    const open = await app.inject({
      method: "GET",
      url: ENDPOINTS.internal.developer.invitationPass,
      cookies: { [INVITATION_PASS_COOKIE_NAME]: pass },
    });
    mocks.readOpenPortalInvitationPass.mockResolvedValueOnce(null);
    const spent = await app.inject({
      method: "GET",
      url: ENDPOINTS.internal.developer.invitationPass,
      cookies: { [INVITATION_PASS_COOKIE_NAME]: pass },
    });

    expect(open.json()).toEqual({ valid: true, email: "new@example.com" });
    expect(mocks.readOpenPortalInvitationPass).toHaveBeenCalledWith("inv-1");
    expect(spent.json()).toEqual({ valid: false, email: null });
  });

  it("answers no for a forged pass and for none, without asking the database", async () => {
    const app = await createApp();

    const forged = await app.inject({
      method: "GET",
      url: ENDPOINTS.internal.developer.invitationPass,
      cookies: { [INVITATION_PASS_COOKIE_NAME]: "forged" },
    });
    const none = await app.inject({ method: "GET", url: ENDPOINTS.internal.developer.invitationPass });

    expect(forged.json()).toEqual({ valid: false, email: null });
    expect(none.json()).toEqual({ valid: false, email: null });
    expect(mocks.readOpenPortalInvitationPass).not.toHaveBeenCalled();
  });
});
