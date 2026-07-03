/**
 * @file System-Action-Registry für ausgehende Mails (MC-078, Scopes MC-081).
 * Eine Action ist ein benanntes Ereignis im System (z.B. „Admin-Einladung
 * versendet"), das an einen Empfänger-Typ gerichtet ist und nur noch seine
 * ereignis-spezifischen Kontext-Variablen deklariert — System- und
 * Empfänger-Variablen (siehe `EMAIL_VARIABLES` in `email-variables.ts`) löst
 * der Backend-Trigger automatisch auf. Templates werden über
 * `email_action_bindings` lose an Actions gebunden; der Backend-Trigger
 * (`services/email-actions.ts`) rendert + sendet alle gebundenen Templates.
 *
 * Diese Registry ist die einzige Quelle der Wahrheit für Action-Keys, ihren
 * Empfänger-Typ und ihre Kontext-Variablen — Dashboard (Actions-Seite) und
 * Backend (Trigger, Kompatibilitäts-Check) konsumieren sie beide.
 */

import { EmailRecipientKind, type EmailRecipientKindValue } from "./email-variables.js";

/** Metadaten einer System-Action. */
export interface EmailActionMeta {
  /** Stabiler Key, persistiert in `email_action_bindings.action_key`. */
  key: string;
  /** Menschlich lesbares Label (Dashboard-Anzeige). */
  label: string;
  /**
   * Nur die ereignis-spezifischen Extra-Variablen, die diese Action beim
   * Auslösen liefert (z.B. eine One-Time-Token-URL). System- und
   * Empfänger-Variablen sind hier NICHT aufgeführt — sie sind für jede Action
   * automatisch verfügbar (siehe `listAvailableEmailVariables`).
   */
  contextVariables: readonly string[];
  /** An welchen Empfänger-Typ diese Action ihre Mails richtet (entscheidet, welche Empfänger-Variablen auflösbar sind). */
  recipientKind: EmailRecipientKindValue;
  /** Wenn `true`, muss mindestens ein aktiviertes Template gebunden sein, sonst wirft der Trigger. */
  required: boolean;
}

/** Alle System-Actions, keyed by ihren stabilen `key`. */
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
  developerPasswordResetRequested: {
    key: "developerPasswordResetRequested",
    label: "Developer password reset",
    contextVariables: ["resetUrl"],
    recipientKind: EmailRecipientKind.DeveloperAccount,
    required: true,
  },
  developerAccountDeleted: {
    key: "developerAccountDeleted",
    label: "Developer account deleted",
    contextVariables: [],
    recipientKind: EmailRecipientKind.DeveloperAccount,
    required: false,
  },
  developerApiAccessApproved: {
    key: "developerApiAccessApproved",
    label: "Developer API access approved",
    contextVariables: ["appName"],
    recipientKind: EmailRecipientKind.DeveloperAccount,
    required: false,
  },
  developerApiAccessRejected: {
    key: "developerApiAccessRejected",
    label: "Developer API access rejected",
    contextVariables: ["appName", "reviewNote"],
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

/** Ein Action-Key aus {@link EMAIL_ACTIONS}. */
export type EmailActionKey = keyof typeof EMAIL_ACTIONS;

/** Bequemer Namespace für Action-Keys (statt Magic-Strings an Call-Sites). */
export const EmailAction = {
  AdminInviteSent: "adminInviteSent",
  DeveloperVerificationRequested: "developerVerificationRequested",
  DeveloperPasswordResetRequested: "developerPasswordResetRequested",
  DeveloperAccountDeleted: "developerAccountDeleted",
  DeveloperApiAccessApproved: "developerApiAccessApproved",
  DeveloperApiAccessRejected: "developerApiAccessRejected",
  DeveloperApiTokenCreated: "developerApiTokenCreated",
} as const satisfies Record<string, EmailActionKey>;

/**
 * Liefert die Metadaten zu einem Key, oder `undefined` bei unbekanntem Key.
 *
 * @param key - Action-Key zum Nachschlagen.
 * @returns Die Metadaten, oder `undefined` falls der Key unbekannt ist.
 */
export function getEmailActionMeta(key: string): EmailActionMeta | undefined {
  return (EMAIL_ACTIONS as Record<string, EmailActionMeta>)[key];
}
