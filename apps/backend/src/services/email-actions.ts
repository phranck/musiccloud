/**
 * @file System-Action-Trigger (MC-078). `triggerEmailAction` fächert ein
 * code-definiertes Ereignis (siehe `@musiccloud/shared` EMAIL_ACTIONS) an
 * alle aktivierten, gebundenen Templates auf: jedes wird gerendert und
 * gesendet. Ersetzt die festverdrahteten Direkt-Aufrufe (`sendTemplatedEmail`
 * mit fester templateId).
 */
import { getEmailActionMeta } from "@musiccloud/shared";

import { getAdminRepository } from "../db/index.js";
import { requireEnv } from "../lib/env.js";
import { sendEmail } from "./email-provider.js";
import { renderEmailTemplate } from "./email-renderer.js";

/**
 * Input for {@link triggerEmailAction}: the recipient and the variables this
 * action instance provides (must satisfy every bound template's
 * `requiredVariables`, see {@link triggerEmailAction}'s `@throws`).
 */
export interface TriggerEmailActionInput {
  /** Recipient address and optional display name. */
  to: { email: string; name?: string };
  /** `{{name}}`-style variables this action occurrence provides for interpolation. */
  variables: Record<string, string>;
}

/**
 * Resolves a code-defined system action to its enabled template bindings and
 * fans out one rendered send per binding. This is the trigger boundary only:
 * rendering is delegated to {@link renderEmailTemplate} and persistence to the
 * {@link AdminRepository} — this function contains no rendering or storage
 * logic of its own.
 *
 * Throw-vs-skip semantics (deliberate, not an oversight):
 * - Unknown `actionKey` → throws. A typo'd action key must never silently
 *   no-op; it means a caller and the registry have drifted.
 * - Known action with zero enabled bindings:
 *   - `required: true` (per the {@link EMAIL_ACTIONS} registry) → throws. A
 *     required action (e.g. an admin invite) with nothing bound means the
 *     admin cannot complete the underlying workflow; failing loudly surfaces
 *     the misconfiguration instead of the invite silently vanishing.
 *   - `required: false` → returns without sending anything. An optional
 *     action with no binding is a deliberate "not wired up yet", not an
 *     error.
 * - A bound template whose `requiredVariables` includes a name the action did
 *   not supply → throws *before* rendering or sending that template. Sending
 *   with an unresolved `{{var}}` placeholder would ship broken mail to a real
 *   recipient; the validation gate exists specifically to prevent that.
 *
 * @param actionKey - a key from `EMAIL_ACTIONS` (e.g. `EmailAction.AdminInviteSent`).
 * @param input - recipient and the variables this action occurrence provides.
 * @throws when the action is unknown; when a `required` action has no enabled
 *   binding; or when a bound template declares a required variable the action
 *   did not supply.
 */
export async function triggerEmailAction(actionKey: string, input: TriggerEmailActionInput): Promise<void> {
  const meta = getEmailActionMeta(actionKey);
  if (!meta) {
    throw new Error(`Unknown email action: "${actionKey}"`);
  }

  const repo = await getAdminRepository();
  const bindings = (await repo.listEmailActionBindings(actionKey)).filter((binding) => binding.enabled);

  if (meta.required && bindings.length === 0) {
    throw new Error(`Required email action "${actionKey}" has no enabled template binding`);
  }

  const branding = await repo.getEmailBranding();
  const baseUrl = requireEnv("PUBLIC_URL");

  for (const binding of bindings) {
    const template = await repo.getEmailTemplateById(binding.templateId);
    if (!template) continue;

    // Send-time gate: did *this invocation* actually supply every variable
    // the template requires? Mirrors the bind-time gate in
    // `routes/admin-email-actions.ts` (which checks the action's *declared*
    // variable set, not a specific invocation's) — keep both in sync if this
    // rule changes.
    const missingVariable = template.requiredVariables.find((rv) => !(rv.name in input.variables));
    if (missingVariable) {
      throw new Error(
        `Template "${template.name}" requires variable "${missingVariable.name}" not supplied by action "${actionKey}"`,
      );
    }

    const { html, subject } = renderEmailTemplate(
      { subject: template.subject, blocks: template.blocks },
      template.branding,
      branding,
      input.variables,
      baseUrl,
    );
    await sendEmail({ to: input.to, subject, html });
  }
}
