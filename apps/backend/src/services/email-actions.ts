/**
 * @file The system action trigger (MC-078, scopes MC-081). `triggerEmailAction`
 * fans a code-defined event (see `EMAIL_ACTIONS` in `@musiccloud/shared`) out
 * to every enabled, bound template and sends each one. The trigger resolves
 * the system variables (from the environment) and the recipient variables
 * (from the addressee) itself, so call sites supply only the recipient and the
 * action's context variables.
 */
import { extractEmailTemplateVariables, getEmailActionMeta } from "@musiccloud/shared";

import { getAdminRepository } from "../db/index.js";
import { sendTemplatedEmail } from "./email-sender.js";
import {
  type EmailActionRecipient,
  resolveRecipientVariables,
  resolveSystemVariables,
} from "./email-variable-resolver.js";

/**
 * Input for {@link triggerEmailAction}: the transport address, the addressee
 * (for recipient-scope variable resolution), and the context extras this
 * action occurrence provides.
 */
export interface TriggerEmailActionInput {
  /** Recipient address and optional display name (transport level). */
  to: { email: string; name?: string };
  /** The addressee the recipient-scope variables are resolved from; its `kind` must match the action's `recipientKind`. */
  recipient: EmailActionRecipient;
  /** The action's declared context variables for this occurrence (e.g. `inviteUrl`). */
  context: Record<string, string>;
}

/**
 * Resolves a code-defined system action to its enabled template bindings and
 * sends each bound template through {@link sendTemplatedEmail}, the one send
 * path the template editor's test send uses as well.
 *
 * Variable resolution (MC-081): the interpolation set is the merge of
 * system-scope values (from env, see {@link resolveSystemVariables}),
 * recipient-scope values (from `input.recipient`, see
 * {@link resolveRecipientVariables}), and `input.context`, in that order. An
 * action's context extras therefore win on a name collision, which the catalog
 * rules out anyway.
 *
 * When it throws and when it skips is deliberate:
 * - An unknown `actionKey` throws. A misspelled action key must never pass
 *   silently, because it means a caller and the registry have drifted apart.
 * - A recipient kind that does not match the action's throws, for the same
 *   reason, and because it would resolve wrong or missing recipient variables.
 * - A known action with no enabled binding throws when the action is
 *   `required` in {@link EMAIL_ACTIONS}, because a required action such as an
 *   admin invite with nothing bound leaves its workflow unfinishable. An
 *   optional action returns without sending, because nothing bound to it means
 *   it is not wired up yet.
 * - A bound template that uses a `{{var}}` outside the merged set throws
 *   before that template is sent, because a mail with an unresolved
 *   placeholder would reach a real recipient.
 *
 * @param actionKey - a key from `EMAIL_ACTIONS` (e.g. `EmailAction.AdminInviteSent`).
 * @param input - transport address, addressee, and context extras.
 * @throws when the action is unknown; when the recipient kind mismatches;
 *   when a `required` action has no enabled binding; or when a bound template
 *   uses a variable the merged resolution set does not cover.
 */
export async function triggerEmailAction(actionKey: string, input: TriggerEmailActionInput): Promise<void> {
  const meta = getEmailActionMeta(actionKey);
  if (!meta) {
    throw new Error(`Unknown email action: "${actionKey}"`);
  }
  if (input.recipient.kind !== meta.recipientKind) {
    throw new Error(
      `Recipient kind "${input.recipient.kind}" does not match action "${actionKey}" (expects "${meta.recipientKind}")`,
    );
  }

  const repo = await getAdminRepository();
  const bindings = (await repo.listEmailActionBindings(actionKey)).filter((binding) => binding.enabled);

  if (meta.required && bindings.length === 0) {
    throw new Error(`Required email action "${actionKey}" has no enabled template binding`);
  }
  if (bindings.length === 0) return;

  const variables: Record<string, string> = {
    ...resolveSystemVariables(),
    ...resolveRecipientVariables(input.recipient),
    ...input.context,
  };

  for (const binding of bindings) {
    const template = await repo.getEmailTemplateById(binding.templateId);
    if (!template) continue;

    // Send-time gate: the merged set has to cover every variable the template
    // uses, as extracted from its subject and body (MC-080). The bind-time
    // gate in `routes/admin-email-actions.ts` checks the action's available
    // names instead, which the resolver's catalog-derived types keep equal to
    // what is resolved here.
    const missingVariable = extractEmailTemplateVariables(template.subject, template.blocks).find(
      (name) => !(name in variables),
    );
    if (missingVariable) {
      throw new Error(
        `Template "${template.name}" requires variable "${missingVariable}" not supplied by action "${actionKey}"`,
      );
    }

    await sendTemplatedEmail({ template, to: input.to, variables });
  }
}
