/**
 * @file Derivation logic for the template editor's variables panel (MC-081).
 *
 * Pure functions only — the `VariablesPanel` component renders what these
 * compute. The offered variable set is driven by the shared catalog
 * (`EMAIL_VARIABLES`) plus the actions the template is currently bound to:
 * bound actions decide which recipient kind's variables resolve and which
 * context extras exist. An unbound template defaults to the admin-user
 * recipient set (the most common case) with no context group.
 */

import {
  EMAIL_VARIABLES,
  type EmailBlock,
  EmailRecipientKind,
  type EmailRecipientKindValue,
  type EmailVariableMeta,
  EmailVariableScope,
  extractEmailTemplateVariables,
  getEmailVariableMeta,
} from "@musiccloud/shared";

/** The subset of a bound action's metadata the panel derivation needs. */
export interface BoundActionVariables {
  recipientKind: EmailRecipientKindValue;
  contextVariables: readonly string[];
}

/** Grouped catalog entries the panel offers, plus the flat availability set for validation. */
export interface VariablesPanelModel {
  /** System-scope variables (always available). */
  system: EmailVariableMeta[];
  /** Recipient-scope variables resolvable for at least one bound action's kind. */
  recipient: EmailVariableMeta[];
  /** Context variables declared by the bound actions (catalog metadata). */
  context: EmailVariableMeta[];
  /** Every offered variable name — the validation set for detected placeholders. */
  availableNames: string[];
}

/** Split of a template's detected `{{var}}` names into offered vs. unknown (likely typos). */
export interface DetectedVariablesSplit {
  known: string[];
  unknown: string[];
}

const CATALOG: Record<string, EmailVariableMeta> = EMAIL_VARIABLES;

/**
 * Builds the panel's grouped variable model from the actions the template is
 * bound to.
 *
 * @param boundActions - Recipient kind + context variables of every action the
 *   template is currently bound to; empty for an unbound template (defaults
 *   the recipient group to the admin-user set, offers no context group).
 * @returns Grouped catalog entries in catalog order plus the flat name set.
 */
export function buildVariablesPanelModel(boundActions: readonly BoundActionVariables[]): VariablesPanelModel {
  const kinds = new Set<EmailRecipientKindValue>(boundActions.map((action) => action.recipientKind));
  if (kinds.size === 0) kinds.add(EmailRecipientKind.AdminUser);

  const system: EmailVariableMeta[] = [];
  const recipient: EmailVariableMeta[] = [];
  for (const meta of Object.values(CATALOG)) {
    if (meta.scope === EmailVariableScope.System) {
      system.push(meta);
    } else if (meta.scope === EmailVariableScope.Recipient && meta.recipientKinds?.some((kind) => kinds.has(kind))) {
      recipient.push(meta);
    }
  }

  const context: EmailVariableMeta[] = [];
  const seenContext = new Set<string>();
  for (const action of boundActions) {
    for (const name of action.contextVariables) {
      if (seenContext.has(name)) continue;
      seenContext.add(name);
      const meta = getEmailVariableMeta(name);
      if (meta) context.push(meta);
    }
  }

  const availableNames = [...system, ...recipient, ...context].map((meta) => meta.name);
  return { system, recipient, context, availableNames };
}

/**
 * Splits the template's auto-extracted placeholder names into those the panel
 * offers (`known`) and those it does not (`unknown` — typos or variables of
 * actions the template is not bound to), preserving first-seen order.
 *
 * @param subject - The template's subject line.
 * @param blocks - The template's ordered body blocks.
 * @param availableNames - The offered set from {@link buildVariablesPanelModel}.
 */
export function splitDetectedVariables(
  subject: string,
  blocks: EmailBlock[],
  availableNames: readonly string[],
): DetectedVariablesSplit {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const name of extractEmailTemplateVariables(subject, blocks)) {
    (availableNames.includes(name) ? known : unknown).push(name);
  }
  return { known, unknown };
}
