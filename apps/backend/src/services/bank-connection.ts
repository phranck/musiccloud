/**
 * @file Connecting musiccloud to the bank account it reads, renewing the
 * connection and letting it go, ported from lmaa.space
 * (`apps/backend/src/services/bank-connection.ts`).
 *
 * Reading the account and the read fields of the status belong to the import,
 * which adds them; until then the status answers them as `null` and `0`. The
 * service's information lines go to the logger the caller hands in, the request
 * logger on a route, and carry the authorization id, the account count and the
 * consent end. The token, the code, the state, the session and the account are
 * never logged.
 */

import { randomBytes } from "node:crypto";
import {
  BANK_CONNECTION_CALLBACK_DASHBOARD_PATH,
  type BankAuthorizationStart,
  type BankConnectionStatus,
  BankErrorCode,
  DAY_MS,
} from "@musiccloud/shared";
import type { FastifyBaseLogger } from "fastify";
import { isEnableBankingConfigured } from "../lib/enable-banking-config.js";
import { requireEnv } from "../lib/env.js";
import { log } from "../lib/infra/logger.js";
import { BankConnectionError } from "./bank-connection-error.js";
import {
  type BankConnectionRecord,
  getLiveBankConnection,
  insertAuthorizationState,
  replaceBankConnection,
  revokeLiveBankConnection,
  takeAuthorizationState,
} from "./bank-connection-store.js";
import { closeSession, createSession, startAuthorization } from "./enable-banking-client.js";

/** The component every log line of this module names. */
const LOG_COMPONENT = "BankConnection";

/** Where the service's information lines go, such as the request logger. */
export type BankConnectionLogger = Pick<FastifyBaseLogger, "info">;

/**
 * How many random bytes the value carried through the return is made of: 32.
 *
 * Thirty-two bytes is 256 bits, written as 64 hexadecimal characters. The value
 * has to survive guessing rather than collision: an attacker who could present
 * a value this site issued would have a code of their own exchanged against
 * this account. At 256 bits that is not a thing to plan for, and a collision
 * between two of them even less so, but the row is still read back after it is
 * written rather than assumed.
 */
const AUTHORIZATION_STATE_BYTES = 32;

/** How long a started authorization has to come back before it stops counting: 15 minutes. */
const AUTHORIZATION_STATE_LIFETIME_MS = 15 * 60 * 1000;

/**
 * How long the consent is asked to last: 180 days.
 *
 * What the bank grants is its own decision and comes back in the answer, which
 * is what gets stored. This is the request.
 */
const CONSENT_REQUESTED_DAYS = 180;

/**
 * How many accounts a usable session reaches: exactly the one account the
 * application is linked to.
 *
 * The provider enforces this from its side by answering with an empty list for
 * anything else, and this side refuses a session that carries a different
 * number rather than storing one whose reach it has not established.
 */
const EXPECTED_ACCOUNT_COUNT = 1;

/**
 * Turns the stored connection into what the dashboard shows.
 *
 * @param connection - The connection in force, or `null` where there is none.
 * @returns The status, which carries nothing that could reach the account. The
 *   read fields stand at `null` and `0` until the import fills them.
 */
function toStatus(connection: BankConnectionRecord | null): BankConnectionStatus {
  return {
    configured: isEnableBankingConfigured(),
    connected: connection !== null,
    institutionName: connection?.aspspName ?? "",
    institutionCountry: connection?.aspspCountry ?? "",
    consentValidUntil: connection?.consentValidUntil?.toISOString() ?? null,
    connectedAt: connection?.createdAt.toISOString() ?? null,
    lastReadAt: null,
    lastReadSucceeded: null,
    lastReadImported: 0,
    lastReadFilled: 0,
    lastReadFailure: null,
    nextReadAt: null,
  };
}

/**
 * What the dashboard shows about the connection.
 *
 * @returns Whether the deployment is configured, whether a connection is in
 *   force, and when its consent lapses.
 *
 * @remarks
 * Every field comes from this site's own database. Nothing here is fetched from
 * the provider, so the page answers while the bank is unreachable and says what
 * it knows rather than nothing.
 */
export async function getBankConnectionStatus(): Promise<BankConnectionStatus> {
  return toStatus(await getLiveBankConnection());
}

/**
 * Closes a session at the provider without letting that failure decide the
 * caller's flow.
 *
 * @param sessionId - The session as it was stored.
 * @returns `true` when the provider closed it, `false` when it refused.
 *
 * @remarks
 * Closing is what ends the consent at the bank, so forgetting the identifier
 * without it leaves a permission standing that nobody can withdraw anymore.
 * The two callers want different things when it fails, which is why this
 * reports rather than throws, and neither of them stays silent about it.
 */
async function closeSessionQuietly(sessionId: string): Promise<boolean> {
  try {
    await closeSession(sessionId);
    return true;
  } catch (cause) {
    log.deviation(
      {
        component: LOG_COMPONENT,
        errorCode: cause instanceof BankConnectionError ? cause.code : BankErrorCode.CloseFailed,
        operation: "bank_session_close",
        outcome: "not_closed_at_provider",
      },
      cause,
    );
    return false;
  }
}

/**
 * Withdraws the connection in force and ends the consent behind it.
 *
 * @param logger - Where the withdrawal is recorded.
 * @returns The status afterwards, which reports nothing connected.
 * @throws {BankConnectionError} `MC-BANK-0008` when no connection is in force,
 *   `MC-BANK-0009` when the site let go of the connection but the provider
 *   would not close the session.
 *
 * @remarks
 * The local withdrawal happens first and stands whatever the provider answers,
 * because the operator asked the site to stop reading the account and that part
 * is this site's own to decide. A provider that then refuses to close leaves a
 * consent at the bank which lapses on its own, and the caller is told rather
 * than left thinking everything is gone.
 */
export async function disconnectBank(logger: BankConnectionLogger): Promise<BankConnectionStatus> {
  const revoked = await revokeLiveBankConnection(new Date());
  if (!revoked) throw new BankConnectionError(BankErrorCode.NotConnected);

  if (!(await closeSessionQuietly(revoked.sessionId))) throw new BankConnectionError(BankErrorCode.CloseFailed);

  logger.info({ component: LOG_COMPONENT, connectionId: revoked.id }, "bank connection withdrawn");
  return toStatus(null);
}

/**
 * Starts an authorization and says where to send the person.
 *
 * @param logger - Where the start is recorded.
 * @returns The bank's address, which the dashboard navigates to.
 * @throws {BankConnectionError} `MC-BANK-0001` when the deployment holds no
 *   credential, and the client's codes when the provider fails.
 * @throws Error when `DASHBOARD_URL` is not set.
 *
 * @remarks
 * The value that ties the return to this start is written down before the
 * person leaves, so a return can only be honored against a start this site
 * made. The return address is built from `DASHBOARD_URL` and the shared
 * callback path rather than from anything in the request, and the same address
 * is registered with the provider, which refuses any other.
 */
export async function beginBankAuthorization(logger: BankConnectionLogger): Promise<BankAuthorizationStart> {
  const now = new Date();
  const state = randomBytes(AUTHORIZATION_STATE_BYTES).toString("hex");
  const redirectUrl = new URL(BANK_CONNECTION_CALLBACK_DASHBOARD_PATH, requireEnv("DASHBOARD_URL")).toString();

  const started = await startAuthorization(
    state,
    redirectUrl,
    new Date(now.getTime() + CONSENT_REQUESTED_DAYS * DAY_MS),
  );

  const stored = await insertAuthorizationState(
    state,
    started.authorizationId,
    new Date(now.getTime() + AUTHORIZATION_STATE_LIFETIME_MS),
    now,
  );

  logger.info(
    { component: LOG_COMPONENT, authorizationId: stored.authorizationId, expiresAt: stored.expiresAt },
    "bank authorization started",
  );

  return { url: started.url };
}

/**
 * Honors a return from the bank and puts the connection in force.
 *
 * @param code - The code the bank issued, to be exchanged for a session.
 * @param state - The value this site sent out, as it came back.
 * @param logger - Where the new connection is recorded.
 * @returns The status the dashboard shows afterwards.
 * @throws {BankConnectionError} `MC-BANK-0006` when the return matches no
 *   start this site made, `MC-BANK-0007` when the session reaches a number of
 *   accounts other than one, and the client's codes when the provider fails.
 *
 * @remarks
 * The value is recognized before the code is spent, so a return nobody started
 * costs one database read and no call to the provider.
 */
export async function completeBankAuthorization(
  code: string,
  state: string,
  logger: BankConnectionLogger,
): Promise<BankConnectionStatus> {
  const now = new Date();

  const started = await takeAuthorizationState(state, now);
  if (!started) {
    log.deviation({
      component: LOG_COMPONENT,
      errorCode: BankErrorCode.StateUnknown,
      operation: "bank_authorization_complete",
      outcome: "matched_no_start",
    });
    throw new BankConnectionError(BankErrorCode.StateUnknown);
  }

  const session = await createSession(code);
  const [accountUid] = session.accountUids;
  if (session.accountUids.length !== EXPECTED_ACCOUNT_COUNT || !accountUid) {
    // Not stored, so nothing here can read the account, and closed at the
    // provider so the consent behind it does not stand for months with nobody
    // holding the identifier that could withdraw it.
    const closed = await closeSessionQuietly(session.sessionId);
    log.deviation({
      component: LOG_COMPONENT,
      errorCode: BankErrorCode.UnexpectedAccounts,
      operation: "bank_authorization_complete",
      outcome: "session_discarded",
      authorizationId: started.authorizationId,
      accountCount: session.accountUids.length,
      closedAtProvider: closed,
    });
    throw new BankConnectionError(BankErrorCode.UnexpectedAccounts);
  }

  const connection = await replaceBankConnection(
    {
      sessionId: session.sessionId,
      accountUid,
      aspspName: session.aspspName,
      aspspCountry: session.aspspCountry,
      consentValidUntil: session.consentValidUntil,
    },
    now,
  );

  logger.info(
    {
      component: LOG_COMPONENT,
      authorizationId: started.authorizationId,
      accountCount: session.accountUids.length,
      consentValidUntil: connection.consentValidUntil,
    },
    "bank connection established",
  );

  return toStatus(connection);
}
