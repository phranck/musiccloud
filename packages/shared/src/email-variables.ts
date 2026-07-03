/**
 * @file Email template variables: auto-extraction of `{{var}}` placeholders
 * (MC-080) and the system-wide variable catalog with scopes (MC-081).
 *
 * A template's expected variables are DERIVED from its content, never declared
 * by hand: `extractEmailTemplateVariables` scans the subject and the body
 * blocks that the renderer actually interpolates and returns the distinct
 * placeholder names.
 *
 * Which variables a template MAY use is defined by the {@link EMAIL_VARIABLES}
 * catalog: system variables (resolved from server config, always available),
 * recipient variables (resolved from the addressee, availability depends on
 * the {@link EmailRecipientKind}), and context variables (supplied only by
 * specific action occurrences, e.g. a freshly minted invite link). Backend
 * gates (bind-time compatibility + send-time validation), the trigger's
 * automatic resolution, and the dashboard editor's variables panel all consume
 * this one catalog, so "what is available" can never drift between them.
 */

import { type EmailBlock, EmailBlockType } from "./email-blocks.js";

/** The three availability classes a template variable can belong to. */
export const EmailVariableScope = {
  /** Resolved from server configuration; available in every template. */
  System: "system",
  /** Resolved from the addressee; availability depends on the recipient kind. */
  Recipient: "recipient",
  /** Supplied by a specific action occurrence (e.g. a one-time token URL). */
  Context: "context",
} as const;

/** A scope value from {@link EmailVariableScope}. */
export type EmailVariableScopeValue = (typeof EmailVariableScope)[keyof typeof EmailVariableScope];

/** The kinds of addressees system mails are sent to. */
export const EmailRecipientKind = {
  /** An `admin_users` row (dashboard staff account). */
  AdminUser: "adminUser",
  /** A `developer_accounts` row (developer-portal account). */
  DeveloperAccount: "developerAccount",
} as const;

/** A recipient kind value from {@link EmailRecipientKind}. */
export type EmailRecipientKindValue = (typeof EmailRecipientKind)[keyof typeof EmailRecipientKind];

/**
 * Catalog metadata for one template variable.
 *
 * @property name - The bare placeholder name as used in `{{name}}`.
 * @property scope - Availability class, see {@link EmailVariableScope}.
 * @property description - Short English explanation shown in the editor UI.
 * @property sampleValue - Stand-in used by test sends and previews when the
 *   real value cannot be resolved (context variables outside their flow).
 * @property recipientKinds - For {@link EmailVariableScope.Recipient} variables
 *   only: the recipient kinds this variable can be resolved for. Absent on
 *   system/context variables (they do not depend on the recipient).
 */
export interface EmailVariableMeta {
  name: string;
  scope: EmailVariableScopeValue;
  description: string;
  sampleValue: string;
  recipientKinds?: readonly EmailRecipientKindValue[];
}

/**
 * The system-wide variable catalog — the single source of truth for which
 * `{{var}}` names exist, what they mean, and when they are available.
 * Resolution of actual VALUES happens in the backend
 * (`services/email-variable-resolver.ts`); this catalog only carries names and
 * metadata so the dashboard can consume it without server access.
 */
export const EMAIL_VARIABLES = {
  websiteUrl: {
    name: "websiteUrl",
    scope: EmailVariableScope.System,
    description: "Public website base URL.",
    sampleValue: "https://musiccloud.io",
  },
  dashboardUrl: {
    name: "dashboardUrl",
    scope: EmailVariableScope.System,
    description: "Admin dashboard base URL.",
    sampleValue: "https://dashboard.musiccloud.io",
  },
  developerUrl: {
    name: "developerUrl",
    scope: EmailVariableScope.System,
    description: "Developer portal base URL.",
    sampleValue: "https://developer.musiccloud.io",
  },
  loginUrl: {
    name: "loginUrl",
    scope: EmailVariableScope.System,
    description: "Dashboard login page URL.",
    sampleValue: "https://dashboard.musiccloud.io/login",
  },
  username: {
    name: "username",
    scope: EmailVariableScope.Recipient,
    description: "Recipient's display name.",
    sampleValue: "jane",
    recipientKinds: [EmailRecipientKind.AdminUser, EmailRecipientKind.DeveloperAccount],
  },
  email: {
    name: "email",
    scope: EmailVariableScope.Recipient,
    description: "Recipient's email address.",
    sampleValue: "jane@example.com",
    recipientKinds: [EmailRecipientKind.AdminUser, EmailRecipientKind.DeveloperAccount],
  },
  role: {
    name: "role",
    scope: EmailVariableScope.Recipient,
    description: "Recipient's admin role.",
    sampleValue: "admin",
    recipientKinds: [EmailRecipientKind.AdminUser],
  },
  inviteUrl: {
    name: "inviteUrl",
    scope: EmailVariableScope.Context,
    description: "One-time admin invite link.",
    sampleValue: "https://dashboard.musiccloud.io/invite/sample-token",
  },
  verifyUrl: {
    name: "verifyUrl",
    scope: EmailVariableScope.Context,
    description: "One-time developer email-verification link.",
    sampleValue: "https://developer.musiccloud.io/verify?token=sample-token",
  },
  resetUrl: {
    name: "resetUrl",
    scope: EmailVariableScope.Context,
    description: "One-time developer password-reset link.",
    sampleValue: "https://developer.musiccloud.io/reset?token=sample-token",
  },
  appName: {
    name: "appName",
    scope: EmailVariableScope.Context,
    description: "Name of the developer's registered application/client.",
    sampleValue: "My Music App",
  },
  reviewNote: {
    name: "reviewNote",
    scope: EmailVariableScope.Context,
    description: "Admin's note explaining an API-access review decision.",
    sampleValue: "Please describe your use case in more detail.",
  },
} as const satisfies Record<string, EmailVariableMeta>;

/**
 * Looks up the catalog metadata for a variable name.
 *
 * @param name - The bare placeholder name (without braces).
 * @returns The catalog entry, or `undefined` for names not in the catalog
 *   (the editor renders those as "unknown variable" warnings).
 */
export function getEmailVariableMeta(name: string): EmailVariableMeta | undefined {
  return (EMAIL_VARIABLES as Record<string, EmailVariableMeta>)[name];
}

/**
 * Computes the full set of variable names a template may use for a given
 * recipient kind plus an action's declared context extras — the shared
 * availability rule behind the bind-time gate and the editor's validation.
 *
 * @param recipientKind - Which addressee kind the mail goes to (decides which
 *   recipient-scope variables resolve, e.g. `role` is admin-only).
 * @param contextVariables - The action's declared context variable names;
 *   appended as-is (deduplicated) after the catalog-derived names.
 * @returns Distinct variable names in catalog order, context extras last.
 */
export function listAvailableEmailVariables(
  recipientKind: EmailRecipientKindValue,
  contextVariables: readonly string[],
): string[] {
  const catalog: Record<string, EmailVariableMeta> = EMAIL_VARIABLES;
  const names: string[] = [];
  for (const meta of Object.values(catalog)) {
    if (meta.scope === EmailVariableScope.System) {
      names.push(meta.name);
    } else if (meta.scope === EmailVariableScope.Recipient && meta.recipientKinds?.includes(recipientKind)) {
      names.push(meta.name);
    }
  }
  for (const name of contextVariables) {
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/** Matches a `{{name}}` placeholder; the capture group is the bare variable name. */
const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Appends every `{{var}}` name found in `text` to `names` (deduplicated),
 * preserving first-seen order.
 *
 * @param text - the string to scan.
 * @param names - the accumulator array, mutated in place.
 * @param seen - the set of already-collected names, mutated in place.
 */
function collectFrom(text: string, names: string[], seen: Set<string>): void {
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
}

/**
 * Extracts the distinct `{{var}}` placeholder names a template uses, in
 * first-seen order. Scans exactly the fields the renderer interpolates: the
 * subject, each text block's `markdown`, and each button block's `url`. Button
 * labels, image alt text, and non-textual blocks are intentionally NOT scanned
 * because the renderer never interpolates them.
 *
 * @param subject - the template's subject line.
 * @param blocks - the template's ordered body blocks.
 * @returns the distinct variable names, in first-seen order (empty when none).
 */
export function extractEmailTemplateVariables(subject: string, blocks: EmailBlock[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  collectFrom(subject, names, seen);
  for (const block of blocks) {
    if (block.type === EmailBlockType.Text) {
      collectFrom(block.markdown, names, seen);
    } else if (block.type === EmailBlockType.Button) {
      collectFrom(block.url, names, seen);
    }
  }

  return names;
}
