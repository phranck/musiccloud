/**
 * @file Connecting musiccloud to the bank account whose payments it counts,
 * ported from lmaa.space (`apps/backend/src/routes/admin/bank-connection.ts`).
 *
 * Split by what a request does. Reading the state is a status that an owner
 * or an admin, the roles that keep the books, may see, while everything that
 * acts reaches a bank account and belongs to the owner alone. The owner check
 * runs in each acting route's `preValidation`, after the admin scope's token
 * check and before the body is validated, so a route's schema never answers
 * somebody who may not use the route. Each acting route takes at most
 * {@link BANK_CONNECTION_BODY_LIMIT_BYTES}, and answers `MC-BANK-0001` before it
 * does anything when the deployment holds no credential. Reading the account
 * now is one of the acting routes, because it reaches the bank account too.
 */

import {
  BANK_CONNECTION_BODY_LIMIT_BYTES,
  BANK_CONNECTION_CALLBACK_SCHEMA,
  BANK_READ_REQUEST_SCHEMA,
  type BankConnectionCallback,
  BankErrorCode,
  type BankReadRequest,
  ENDPOINTS,
  isCalendarDay,
} from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireOwner, requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { isEnableBankingConfigured } from "../lib/enable-banking-config.js";
import { replyWithApiError } from "../lib/infra/api-error-handler.js";
import {
  beginBankAuthorization,
  completeBankAuthorization,
  disconnectBank,
  getBankConnectionStatus,
} from "../services/bank-connection.js";
import { BankConnectionError } from "../services/bank-connection-error.js";
import { runBankIngestion } from "../services/bank-ingestion.js";

/** The code a body is refused under when it passed the schema but names a day that does not exist. */
const MALFORMED_REQUEST_CODE = "MC-REQ-0001";

/**
 * Lets only the owner through, as a `preValidation` hook.
 *
 * @param request - The request, whose token the admin scope has checked.
 * @param reply - The reply, answered with 403 for anybody else.
 * @returns The reply once it has been answered, which stops the route there.
 */
async function ownerOnly(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
  if (!(await requireOwner(request, reply))) return reply;
  return undefined;
}

/**
 * Runs an acting route's work, or answers why it cannot.
 *
 * The 503 is the boundary's answer to a deployment holding no credential, and
 * the client refuses to sign without a key regardless, so neither answer
 * depends on the other being remembered. A refusal of the bank connection is
 * answered with its own `MC-BANK-*` code from the registry; anything else goes
 * to the global error handler.
 *
 * @param reply - The reply to answer on.
 * @param work - What the route does once the credential is there.
 * @returns What `work` resolved with, or the answered reply.
 */
async function act<Result>(reply: FastifyReply, work: () => Promise<Result>): Promise<Result | FastifyReply> {
  if (!isEnableBankingConfigured()) return replyWithApiError(reply, BankErrorCode.NotConfigured);
  try {
    return await work();
  } catch (error) {
    if (error instanceof BankConnectionError) return replyWithApiError(reply, error.code);
    throw error;
  }
}

/**
 * Registers the routes on the admin scope, whose `authenticateAdmin` hook has
 * already checked the token.
 *
 * @param app - The admin scope.
 */
export async function adminBankConnectionRoutes(app: FastifyInstance) {
  /**
   * What the dashboard shows. Answered entirely from this site's own database,
   * so the page still says what it knows while the provider is unreachable. It
   * carries neither the session nor the account identifier.
   */
  app.get(ENDPOINTS.admin.sponsoring.bankConnection, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    return getBankConnectionStatus();
  });

  /** Starts an authorization and says where to send the browser. */
  app.post(
    ENDPOINTS.admin.sponsoring.bankConnectionAuthorize,
    { preValidation: ownerOnly, bodyLimit: BANK_CONNECTION_BODY_LIMIT_BYTES },
    async (request, reply) => act(reply, () => beginBankAuthorization(request.log)),
  );

  /**
   * Spends the return from the bank. The code is exchanged here rather than in
   * the dashboard, because the key that signs the exchange is here and nowhere
   * else.
   */
  app.post(
    ENDPOINTS.admin.sponsoring.bankConnectionSession,
    {
      preValidation: ownerOnly,
      bodyLimit: BANK_CONNECTION_BODY_LIMIT_BYTES,
      schema: { body: BANK_CONNECTION_CALLBACK_SCHEMA },
    },
    async (request, reply) => {
      const { code, state } = request.body as BankConnectionCallback;
      return act(reply, () => completeBankAuthorization(code.trim(), state.trim(), request.log));
    },
  );

  /**
   * Lets the account go. Takes no identifier, so there is nothing that could
   * point at a connection other than the one in force. The 503 stands here too,
   * because closing the session at the bank needs the same credential as
   * opening it did.
   */
  app.delete(
    ENDPOINTS.admin.sponsoring.bankConnection,
    { preValidation: ownerOnly, bodyLimit: BANK_CONNECTION_BODY_LIMIT_BYTES },
    async (request, reply) => act(reply, () => disconnectBank(request.log)),
  );

  /**
   * Reads the account now rather than waiting for the next background run.
   * This is the account holder asking for their own information, which Article
   * 36(5)(a) of Commission Delegated Regulation (EU) 2018/389 does not cap, so
   * it draws on a budget of its own and cannot lock the background run out.
   * The body takes an optional day to start at and nothing else, and a day that
   * does not exist is refused like any malformed body. A read that did nothing
   * answers why with 200, because that is an ordinary answer rather than a fault.
   */
  app.post(
    ENDPOINTS.admin.sponsoring.bankConnectionSync,
    {
      preValidation: ownerOnly,
      bodyLimit: BANK_CONNECTION_BODY_LIMIT_BYTES,
      schema: { body: BANK_READ_REQUEST_SCHEMA },
    },
    async (request, reply) => {
      const { from } = request.body as BankReadRequest;
      if (from !== undefined && !isCalendarDay(from)) return replyWithApiError(reply, MALFORMED_REQUEST_CODE);
      return act(reply, () => runBankIngestion("manual", from === undefined ? {} : { from }, request.log));
    },
  );
}
