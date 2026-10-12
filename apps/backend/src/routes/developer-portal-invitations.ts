/**
 * @file Invitations into the developer portal while it is closed.
 *
 * Four pieces, registered in three scopes:
 *
 * - The owner's routes, in the admin scope: list, invite, send again, withdraw.
 * - The redemption an invitation link performs, at the root like the other
 *   `/api/dev/auth` routes, because the person following a link may hold no
 *   session.
 * - The internal read the portal's gate asks whether a pass is still good,
 *   because only the backend holds the key a pass is signed with.
 * - {@link applyInvitationPass}, which sign-up, email sign-in and the GitHub
 *   exchange call to end a pass on the account the person arrived with.
 *
 * Logs name an invitation by id and say what happened. They never carry the
 * link's token or the invited address.
 */
import {
  ENDPOINTS,
  INVITATION_PASS_COOKIE_NAME,
  PortalInvitationNext,
  type PortalInvitationNextValue,
  type PortalInvitationPass,
  type PortalInvitationRedemption,
  ROUTE_TEMPLATES,
} from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { requireOwner } from "../lib/admin-caller.js";
import { INVALID_EMAIL_CODE, normalizeEmailAddress } from "../lib/email-address.js";
import { replyWithApiError } from "../lib/infra/api-error-handler.js";
import { createApiErrorResponse, sanitizeErrorForLog } from "../lib/infra/api-errors.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { RateLimiter } from "../lib/infra/rate-limiter.js";
import {
  clearedInvitationPassCookieOptions,
  issueInvitationPass,
  readInvitationPass,
  SESSION_COOKIE_NAME,
} from "../services/developer-auth.js";
import {
  bindPortalInvitation,
  invitePortalDeveloper,
  listPortalInvitations,
  PortalInvitationMailError,
  readOpenPortalInvitationPass,
  redeemPortalInvitation,
  resendPortalInvitation,
  withdrawPortalInvitation,
} from "../services/developer-portal-invitations.js";
import { resolveDeveloperSession } from "../services/developer-session.js";

/** The longest address the invite form accepts, which is the longest an address may be. */
const MAX_EMAIL_LENGTH = 320;

/** What an invitation id looks like: a nanoid. */
const INVITATION_ID_PATTERN = "^[A-Za-z0-9_-]{1,64}$";

/** What a link's token looks like: 32 bytes in base64url, unpadded. */
const INVITATION_TOKEN_PATTERN = "^[A-Za-z0-9_-]{43}$";

/** The code a refused invitation link answers with; its `reason` stands beside it. */
const INVITATION_NO_LONGER_VALID_CODE = "MC-REQ-0008";

/** The code an invitation answers with when its mail could not be sent. */
const INVITATION_NOT_SENT_CODE = "MC-SYS-0003";

/**
 * Per-IP throttle for redemption: 10 a minute.
 *
 * Its own budget beside the sign-in one, so following links cannot spend a
 * login attempt or be spent by one. A token carries 256 bits, so this is about
 * noise rather than guessing.
 */
const redemptionRateLimiter = new RateLimiter(10, 60_000);

/** `preHandler` throttling redemption per client IP. */
async function throttleRedemption(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const check = redemptionRateLimiter.check(request.ip);
  if (check.limited) await sendRateLimitError(reply, check);
}

const inviteBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["email"],
  properties: { email: { type: "string", minLength: 3, maxLength: MAX_EMAIL_LENGTH } },
} as const;

const invitationParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: { id: { type: "string", pattern: INVITATION_ID_PATTERN } },
} as const;

const redeemBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["token"],
  properties: { token: { type: "string", pattern: INVITATION_TOKEN_PATTERN } },
} as const;

/**
 * Answers an invitation whose mail could not be sent, and logs why.
 *
 * @param request - The request, for its logger.
 * @param reply - The reply to send through.
 * @param error - The failure the service raised.
 * @returns The sent reply.
 */
function replyInvitationNotSent(request: FastifyRequest, reply: FastifyReply, error: PortalInvitationMailError) {
  request.log.error(
    {
      cause: sanitizeErrorForLog(error.cause, process.env.NODE_ENV !== "production"),
      errorCode: INVITATION_NOT_SENT_CODE,
      operation: "portal_invitation_send",
      outcome: "not_sent",
    },
    "portal invitation mail could not be sent; nothing was stored",
  );
  return reply.status(503).send(createApiErrorResponse(INVITATION_NOT_SENT_CODE));
}

/**
 * Registers the owner's routes: list, invite, send again, withdraw.
 *
 * They sit beside the portal availability switches and are owner-only for the
 * same reason: each one decides who may use a portal that is otherwise shut.
 */
export async function developerPortalInvitationAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get(ENDPOINTS.admin.developer.portalInvitations, async (request, reply) => {
    if (!(await requireOwner(request, reply))) return;
    return { invitations: await listPortalInvitations() };
  });

  app.post<{ Body: { email: string } }>(
    ENDPOINTS.admin.developer.portalInvitations,
    { schema: { body: inviteBodySchema } },
    async (request, reply) => {
      const owner = await requireOwner(request, reply);
      if (!owner) return;
      const email = normalizeEmailAddress(request.body.email);
      if (!email) return reply.status(400).send(createApiErrorResponse(INVALID_EMAIL_CODE));

      try {
        const invitation = await invitePortalDeveloper(email, owner.id);
        request.log.info({ invitationId: invitation.id, operation: "portal_invitation_send", outcome: "sent" });
        return reply.status(201).send({ invitation });
      } catch (error) {
        if (error instanceof PortalInvitationMailError) return replyInvitationNotSent(request, reply, error);
        throw error;
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    ROUTE_TEMPLATES.admin.developer.portalInvitationResend,
    { schema: { params: invitationParamsSchema } },
    async (request, reply) => {
      if (!(await requireOwner(request, reply))) return;
      try {
        const result = await resendPortalInvitation(request.params.id);
        if ("missing" in result) return reply.status(404).send(createApiErrorResponse("MC-RES-0003"));
        if ("notOpen" in result) {
          return reply.status(409).send(
            createApiErrorResponse("MC-REQ-0002", {
              overrideMessage: "Only an open invitation can be sent again. Invite the address again instead.",
            }),
          );
        }
        request.log.info({ invitationId: request.params.id, operation: "portal_invitation_send", outcome: "resent" });
        return { invitation: result.invitation };
      } catch (error) {
        if (error instanceof PortalInvitationMailError) return replyInvitationNotSent(request, reply, error);
        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    ROUTE_TEMPLATES.admin.developer.portalInvitationDetail,
    { schema: { params: invitationParamsSchema } },
    async (request, reply) => {
      if (!(await requireOwner(request, reply))) return;
      const invitation = await withdrawPortalInvitation(request.params.id);
      if (!invitation) return reply.status(404).send(createApiErrorResponse("MC-RES-0003"));
      request.log.info({ invitationId: invitation.id, operation: "portal_invitation_withdraw", outcome: "withdrawn" });
      return { invitation };
    },
  );
}

/**
 * Registers the redemption an invitation link performs.
 *
 * The portal's invitation page calls it once it has loaded, rather than on the
 * request for the link, so a mail scanner fetching the link does not spend it.
 */
export async function devPortalInvitationRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { token: string } }>(
    ENDPOINTS.dev.auth.redeemInvitation,
    { preHandler: throttleRedemption, schema: { body: redeemBodySchema } },
    async (request, reply) => {
      const result = await redeemPortalInvitation(request.body.token);
      if ("refusal" in result) {
        return replyWithApiError(reply, INVITATION_NO_LONGER_VALID_CODE, { extra: { reason: result.refusal } });
      }

      const { invitation } = result;
      const session = await resolveDeveloperSession(request.cookies?.[SESSION_COOKIE_NAME], (token) =>
        app.jwt.verify(token),
      );
      const sessionAccountId = "account" in session ? session.account.id : null;

      let next: PortalInvitationNextValue;
      if (invitation.accountId !== null) {
        // The address had an account when the invitation was sent, and that
        // account carries the grant already.
        next = sessionAccountId === invitation.accountId ? PortalInvitationNext.Dashboard : PortalInvitationNext.SignIn;
      } else if (sessionAccountId !== null) {
        await bindPortalInvitation(invitation.id, sessionAccountId);
        next = PortalInvitationNext.Dashboard;
      } else {
        const pass = issueInvitationPass(invitation.id, (payload, options) => app.jwt.sign(payload, options));
        reply.setCookie(INVITATION_PASS_COOKIE_NAME, pass.token, pass.cookieOptions);
        next = PortalInvitationNext.SignUp;
      }

      request.log.info({ invitationId: invitation.id, operation: "portal_invitation_redeem", outcome: next });
      const body: PortalInvitationRedemption = { next, email: invitation.email };
      return body;
    },
  );
}

/**
 * Registers the internal read the portal's gate asks about a pass.
 *
 * It answers with the invited address as well, which the sign-up form starts
 * with, so the address never has to travel in a page's URL.
 */
export async function developerPortalInvitationInternalRoutes(app: FastifyInstance): Promise<void> {
  app.get(ENDPOINTS.internal.developer.invitationPass, async (request): Promise<PortalInvitationPass> => {
    const invitationId = readInvitationPass(request.cookies?.[INVITATION_PASS_COOKIE_NAME], (token) =>
      app.jwt.verify(token),
    );
    const open = invitationId === null ? null : await readOpenPortalInvitationPass(invitationId);
    return open ? { valid: true, email: open.email } : { valid: false, email: null };
  });
}

/**
 * Ends an invitation pass on the account a person has just signed up or
 * signed in with.
 *
 * Where the request carries a pass whose invitation is still unbound, the
 * invitation is bound to the account and the grant written onto it. The
 * cookie is cleared whatever the outcome, because a pass that bound nothing
 * this time will bind nothing next time either.
 *
 * @param app - The Fastify instance, for its JWT verifier.
 * @param request - The sign-up or sign-in request.
 * @param reply - Its reply, which clears the cookie.
 * @param accountId - The account the person arrived with.
 */
export async function applyInvitationPass(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string,
): Promise<void> {
  const cookie = request.cookies?.[INVITATION_PASS_COOKIE_NAME];
  if (!cookie) return;

  const invitationId = readInvitationPass(cookie, (token) => app.jwt.verify(token));
  const bound = invitationId !== null && (await bindPortalInvitation(invitationId, accountId));
  reply.clearCookie(INVITATION_PASS_COOKIE_NAME, clearedInvitationPassCookieOptions());
  request.log.info({
    invitationId,
    operation: "portal_invitation_bind",
    outcome: bound ? "granted" : "pass_spent",
  });
}
