/**
 * @file System-Action-Trigger (MC-078, Scopes MC-081). `triggerEmailAction`
 * fächert ein code-definiertes Ereignis (siehe `@musiccloud/shared`
 * EMAIL_ACTIONS) an alle aktivierten, gebundenen Templates auf: jedes wird
 * gerendert und gesendet. System-Variablen (Env) und Empfänger-Variablen
 * (Adressat) löst der Trigger selbst auf — Call-Sites liefern nur noch den
 * Empfänger und die ereignis-spezifischen Kontext-Variablen der Action.
 */
import { extractEmailTemplateVariables, getEmailActionMeta } from "@musiccloud/shared";

import { getAdminRepository } from "../db/index.js";
import { requireEnv } from "../lib/env.js";
import { sendEmail } from "./email-provider.js";
import { renderEmailTemplate } from "./email-renderer.js";
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
 * fans out one rendered send per binding. This is the trigger boundary only:
 * rendering is delegated to {@link renderEmailTemplate} and persistence to the
 * {@link AdminRepository} — this function contains no rendering or storage
 * logic of its own.
 *
 * Variable resolution (MC-081): the interpolation set is the merge of
 * system-scope values (from env, see {@link resolveSystemVariables}),
 * recipient-scope values (from `input.recipient`, see
 * {@link resolveRecipientVariables}), and `input.context` — in that order, so
 * an action's context extras win on a (by catalog design impossible) name
 * collision.
 *
 * Throw-vs-skip semantics (deliberate, not an oversight):
 * - Unknown `actionKey` → throws. A typo'd action key must never silently
 *   no-op; it means a caller and the registry have drifted.
 * - Recipient kind mismatch (caller hands a developer account to an
 *   admin-user action or vice versa) → throws. That is caller/registry drift
 *   which would render wrong or missing recipient variables.
 * - Known action with zero enabled bindings:
 *   - `required: true` (per the {@link EMAIL_ACTIONS} registry) → throws. A
 *     required action (e.g. an admin invite) with nothing bound means the
 *     admin cannot complete the underlying workflow; failing loudly surfaces
 *     the misconfiguration instead of the invite silently vanishing.
 *   - `required: false` → returns without sending anything. An optional
 *     action with no binding is a deliberate "not wired up yet", not an
 *     error.
 * - A bound template that uses a `{{var}}` outside the merged resolution set
 *   → throws *before* rendering or sending that template. Sending with an
 *   unresolved `{{var}}` placeholder would ship broken mail to a real
 *   recipient; the validation gate exists specifically to prevent that.
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

  const branding = await repo.getEmailBranding();
  const baseUrl = requireEnv("PUBLIC_URL");

  for (const binding of bindings) {
    const template = await repo.getEmailTemplateById(binding.templateId);
    if (!template) continue;

    // Send-time gate: does the merged resolution set cover every variable the
    // template uses? The required set is auto-extracted from the template's
    // subject + body (MC-080), never a hand-declared list. Mirrors the
    // bind-time gate in `routes/admin-email-actions.ts` (which checks against
    // the action's *available* variable set, not a specific invocation's) —
    // keep both in sync if this rule changes.
    const missingVariable = extractEmailTemplateVariables(template.subject, template.blocks).find(
      (name) => !(name in variables),
    );
    if (missingVariable) {
      throw new Error(
        `Template "${template.name}" requires variable "${missingVariable}" not supplied by action "${actionKey}"`,
      );
    }

    const { html, subject } = renderEmailTemplate(
      { subject: template.subject, blocks: template.blocks },
      template.branding,
      branding,
      variables,
      baseUrl,
    );
    await sendEmail({ to: input.to, subject, html });
  }
}
