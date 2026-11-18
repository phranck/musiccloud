/**
 * @file The warnings about a lapsing bank consent, ported from lmaa.space
 * (`apps/backend/src/services/bank-consent.ts`).
 *
 * lmaa writes a fixed mail to `OWNER_EMAIL` and sends a push. musiccloud sends
 * every mail through its email actions, so the warning is the
 * `bankConsentNotice` action, addressed to the dashboard's owner, with lmaa's
 * words carried in as context variables. musiccloud has no push notifications,
 * so the mail is the only channel. The bank worker in `bank-ingestion.ts`
 * looks at the consent every six hours, beside its read of the account.
 */

import {
  BANK_CONNECTION_DASHBOARD_PATH,
  BANK_CONSENT_NOTICE_DAYS,
  BANK_CONSENT_NOTICE_STAGES,
  type BankConsentNoticeStage,
  DAY_MS,
  EmailAction,
  EmailRecipientKind,
} from "@musiccloud/shared";
import { getAdminRepository } from "../db/index.js";
import { requireEnv } from "../lib/env.js";
import { log } from "../lib/infra/logger.js";
import { getLiveBankConnection, setConsentNoticeStage } from "./bank-connection-store.js";
import { triggerEmailAction } from "./email-actions.js";

/** The component every log line of this module names. */
const LOG_COMPONENT = "BankConsent";

/** The role whose holder is warned, because connecting the bank is theirs alone. */
const OWNER_ROLE = "owner";

/** The rung that means the consent is gone, which a refused read reaches whatever the date says. */
const LAPSED_STAGE: BankConsentNoticeStage = "lapsed";

/** What each rung says to the owner. */
const STAGE_TEXT: Record<BankConsentNoticeStage, { subject: string; message: string }> = {
  soon: {
    subject: "The bank connection expires in two weeks",
    message:
      "The consent for reading the account expires soon. Renewing takes two minutes and is done in the dashboard under Sponsoring, Bank connection.",
  },
  imminent: {
    subject: "The bank connection expires in three days",
    message:
      "After that the site reads no more incoming payments, and the total stops moving. Renew it in the dashboard under Sponsoring, Bank connection.",
  },
  lapsed: {
    subject: "The bank connection has expired",
    message:
      "No incoming payments are read anymore. The total on the site stays at the last known figure until the connection is renewed.",
  },
};

/**
 * Which rung a consent has reached, if any.
 *
 * @param validUntil - When the consent lapses, or `null` where none was stated.
 * @param now - The moment to measure against.
 * @returns The furthest rung reached, or `null` while there is still time and
 *   where no date was promised.
 */
export function resolveConsentNoticeStage(validUntil: Date | null, now: Date): BankConsentNoticeStage | null {
  if (!validUntil) return null;

  const remainingMs = validUntil.getTime() - now.getTime();
  if (remainingMs <= 0) return "lapsed";
  if (remainingMs < BANK_CONSENT_NOTICE_DAYS.imminent * DAY_MS) return "imminent";
  if (remainingMs < BANK_CONSENT_NOTICE_DAYS.soon * DAY_MS) return "soon";
  return null;
}

/**
 * Whether a rung still has to be announced.
 *
 * @param reached - The rung the consent has reached, or `null`.
 * @param announced - The furthest rung already announced, or `null`.
 * @returns `true` only for a rung further along than the last one sent.
 *
 * @remarks
 * The staircase only ever climbs. A consent cannot un-lapse, and a renewal
 * writes a new connection whose record of what was said starts empty, so
 * nothing has to be reset.
 */
export function shouldAnnounceStage(reached: BankConsentNoticeStage | null, announced: string | null): boolean {
  if (!reached) return false;
  if (!announced) return true;
  return (
    BANK_CONSENT_NOTICE_STAGES.indexOf(reached) >
    BANK_CONSENT_NOTICE_STAGES.indexOf(announced as BankConsentNoticeStage)
  );
}

/**
 * Tells the owner that a rung was reached.
 *
 * @param stage - The rung reached.
 * @throws Error when the dashboard has no owner with an address, or the mail
 *   fails, including when no template is bound to `bankConsentNotice`.
 *
 * @remarks
 * Lets every failure through. The rung is recorded only once this has
 * returned, so a warning that did not go out is not counted as said and is
 * tried again at the next check.
 */
async function announce(stage: BankConsentNoticeStage): Promise<void> {
  const owner = (await (await getAdminRepository()).listAdminUsers()).find((admin) => admin.role === OWNER_ROLE);
  if (!owner?.email) throw new Error("The dashboard's owner has no address to warn about the bank consent.");

  const { subject, message } = STAGE_TEXT[stage];
  await triggerEmailAction(EmailAction.BankConsentNotice, {
    to: { email: owner.email },
    recipient: { kind: EmailRecipientKind.AdminUser, username: owner.username, email: owner.email, role: owner.role },
    context: {
      bankConsentSubject: subject,
      bankConsentMessage: message,
      bankConnectionUrl: `${requireEnv("DASHBOARD_URL")}${BANK_CONNECTION_DASHBOARD_PATH}`,
    },
  });
}

/**
 * Warns about a lapsing consent, at most once per rung.
 *
 * @param now - The moment to measure against.
 * @throws What {@link announce} throws; nothing is recorded then.
 *
 * @remarks
 * Reached rungs are recorded on the connection, so a restart, a second
 * container or a fourth look of the day cannot repeat one.
 */
export async function announceConsentStage(now = new Date()): Promise<void> {
  const connection = await getLiveBankConnection();
  if (!connection) return;

  const reached = resolveConsentNoticeStage(connection.consentValidUntil, now);
  if (!reached || !shouldAnnounceStage(reached, connection.consentNoticeStage)) return;

  await announce(reached);
  await setConsentNoticeStage(connection.id, reached);

  log.warn(LOG_COMPONENT, "the bank consent is running out", { stage: reached });
}

/**
 * Warns that a read was actually refused, whatever the stored date says.
 *
 * @throws What {@link announce} throws; nothing is recorded then.
 *
 * @remarks
 * The date is only what the bank promised when it granted the consent; it may
 * withdraw earlier. A refused read is what happened rather than what was
 * expected, so it warns on its own trigger. The import calls it when a read
 * finds the consent lapsed.
 *
 * It shares the recorded rung with the staircase above, because both say the
 * same thing to the same person and saying it twice is what this design is
 * against. Whichever notices first sends, and the other stays quiet.
 */
export async function announceConsentRefused(): Promise<void> {
  const connection = await getLiveBankConnection();
  if (!connection) return;
  if (!shouldAnnounceStage(LAPSED_STAGE, connection.consentNoticeStage)) return;

  await announce(LAPSED_STAGE);
  await setConsentNoticeStage(connection.id, LAPSED_STAGE);

  log.warn(LOG_COMPONENT, "the bank refused a read: consent has lapsed");
}
