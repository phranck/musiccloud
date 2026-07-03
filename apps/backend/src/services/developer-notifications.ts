/**
 * @file Optional developer lifecycle notifications (MC-084). One shared entry
 * point for the `required: false` actions fired from API-access flows: it
 * resolves the addressee from their developer-account id and never throws —
 * review/token flows must not break over mail problems (mirrors the invite
 * route's resilience semantics). Without an enabled template binding the
 * trigger itself silently skips, so unbound notifications cost one repo read.
 */

import { EmailRecipientKind } from "@musiccloud/shared";

import { getDeveloperRepository } from "../db/index.js";
import { triggerEmailAction } from "./email-actions.js";

/** The minimal logger shape needed (Fastify request logger compatible). */
interface NotifyLogger {
  error: (obj: unknown, msg: string) => void;
}

/**
 * Fires an optional developer notification action.
 *
 * @param log - The request logger for failure reporting.
 * @param developerAccountId - The account to notify; a missing account (e.g.
 *   deleted meanwhile) skips silently.
 * @param actionKey - One of the `required: false` lifecycle actions.
 * @param context - The action's declared context variables.
 */
export async function notifyDeveloper(
  log: NotifyLogger,
  developerAccountId: string,
  actionKey: string,
  context: Record<string, string>,
): Promise<void> {
  try {
    const account = await (await getDeveloperRepository()).findDeveloperAccountById(developerAccountId);
    if (!account) return;
    await triggerEmailAction(actionKey, {
      to: { email: account.email },
      recipient: {
        kind: EmailRecipientKind.DeveloperAccount,
        email: account.email,
        displayName: account.displayName,
      },
      context,
    });
  } catch (error) {
    log.error({ err: error, developerAccountId, actionKey }, "failed to send developer notification");
  }
}
