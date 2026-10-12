/**
 * @file The registry of system actions that send mail (MC-078, scopes MC-081).
 *
 * An action is a named event in the system, such as "admin invite sent", that
 * is addressed to one recipient kind and declares only the context variables
 * its occurrence supplies. The backend trigger resolves the system and
 * recipient variables (see `EMAIL_VARIABLES` in `email-variables.ts`) by
 * itself. Templates are bound to actions through `email_action_bindings`, and
 * the trigger (`services/email-actions.ts` in the backend) renders and sends
 * every bound template.
 *
 * This registry is the only definition of action keys, their recipient kind
 * and their context variables. The dashboard's actions page and the backend's
 * trigger and compatibility check both read it.
 */

import { type ContextEmailVariableName, EmailRecipientKind, type EmailRecipientKindValue } from "./email-variables.js";

/** Metadata of one system action. */
export interface EmailActionMeta {
  /** Stable key, stored in `email_action_bindings.action_key`. */
  key: string;
  /** Human-readable label shown in the dashboard. */
  label: string;
  /**
   * The event-specific variables this action supplies when it fires, such as
   * a one-time token URL. System and recipient variables are not listed here,
   * because every action has them (see `listAvailableEmailVariables`). Typed
   * with the catalog's context-scope names, so a misspelled one fails to compile.
   */
  contextVariables: readonly ContextEmailVariableName[];
  /** The recipient kind this action mails, which decides the recipient variables that resolve. */
  recipientKind: EmailRecipientKindValue;
  /** When `true`, at least one enabled template must be bound, or the trigger throws. */
  required: boolean;
}

/** Every system action, keyed by its stable `key`. */
export const EMAIL_ACTIONS = {
  adminInviteSent: {
    key: "adminInviteSent",
    label: "Admin invite sent",
    contextVariables: ["inviteUrl"],
    recipientKind: EmailRecipientKind.AdminUser,
    required: true,
  },
  developerVerificationRequested: {
    key: "developerVerificationRequested",
    label: "Developer email verification",
    contextVariables: ["verifyUrl"],
    recipientKind: EmailRecipientKind.DeveloperAccount,
    required: true,
  },
  developerEmailChangeRequested: {
    key: "developerEmailChangeRequested",
    label: "Developer sign-in address change, confirmation",
    contextVariables: ["confirmUrl", "newEmail"],
    recipientKind: EmailRecipientKind.DeveloperAccount,
    required: true,
  },
  developerEmailChangeNotified: {
    key: "developerEmailChangeNotified",
    label: "Developer sign-in address change, notice to the old address",
    contextVariables: ["newEmail"],
    recipientKind: EmailRecipientKind.DeveloperAccount,
    required: false,
  },
  developerPasswordResetRequested: {
    key: "developerPasswordResetRequested",
    label: "Developer password reset",
    contextVariables: ["resetUrl"],
    recipientKind: EmailRecipientKind.DeveloperAccount,
    required: true,
  },
  developerAccountCreated: {
    key: "developerAccountCreated",
    label: "Developer account created",
    contextVariables: [],
    recipientKind: EmailRecipientKind.DeveloperAccount,
    required: false,
  },
  developerAccountDeleted: {
    key: "developerAccountDeleted",
    label: "Developer account deleted",
    contextVariables: [],
    recipientKind: EmailRecipientKind.DeveloperAccount,
    required: false,
  },
  developerApiTokenCreated: {
    key: "developerApiTokenCreated",
    label: "Developer API token created",
    contextVariables: ["appName"],
    recipientKind: EmailRecipientKind.DeveloperAccount,
    required: false,
  },
} as const satisfies Record<string, EmailActionMeta>;

/** An action key from {@link EMAIL_ACTIONS}. */
export type EmailActionKey = keyof typeof EMAIL_ACTIONS;

/** The action keys by name, so call sites do not spell them as strings. */
export const EmailAction = {
  AdminInviteSent: "adminInviteSent",
  DeveloperVerificationRequested: "developerVerificationRequested",
  DeveloperPasswordResetRequested: "developerPasswordResetRequested",
  /** Confirmation sent to the address a developer wants to sign in with. */
  DeveloperEmailChangeRequested: "developerEmailChangeRequested",
  /** Notice sent to the address being left, so a change nobody asked for is seen. */
  DeveloperEmailChangeNotified: "developerEmailChangeNotified",
  DeveloperAccountCreated: "developerAccountCreated",
  DeveloperAccountDeleted: "developerAccountDeleted",
  DeveloperApiTokenCreated: "developerApiTokenCreated",
} as const satisfies Record<string, EmailActionKey>;

/**
 * Looks up the metadata of an action key.
 *
 * @param key - The action key to look up.
 * @returns The metadata, or `undefined` for an unknown key.
 */
export function getEmailActionMeta(key: string): EmailActionMeta | undefined {
  return (EMAIL_ACTIONS as Record<string, EmailActionMeta>)[key];
}
