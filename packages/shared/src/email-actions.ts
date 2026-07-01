/**
 * @file System-Action-Registry für ausgehende Mails (MC-078). Eine Action ist
 * ein benanntes Ereignis im System (z.B. „Admin-Einladung versendet"), das
 * einen festen Satz Template-Variablen liefert. Templates werden über
 * `email_action_bindings` lose an Actions gebunden; der Backend-Trigger
 * (`services/email-actions.ts`) rendert + sendet alle gebundenen Templates.
 *
 * Diese Registry ist die einzige Quelle der Wahrheit für Action-Keys und ihre
 * Variablen — Dashboard (Actions-Seite) und Backend (Trigger, Kompatibilitäts-
 * Check) konsumieren sie beide.
 */

/** Metadaten einer System-Action. */
export interface EmailActionMeta {
  /** Stabiler Key, persistiert in `email_action_bindings.action_key`. */
  key: string;
  /** Menschlich lesbares Label (Dashboard-Anzeige). */
  label: string;
  /** Variablennamen, die diese Action beim Auslösen bereitstellt. */
  variables: string[];
  /** Wenn `true`, muss mindestens ein aktiviertes Template gebunden sein, sonst wirft der Trigger. */
  required: boolean;
}

/** Alle System-Actions, keyed by ihren stabilen `key`. */
export const EMAIL_ACTIONS = {
  adminInviteSent: {
    key: "adminInviteSent",
    label: "Admin invite sent",
    variables: ["username", "email", "role", "inviteUrl", "loginUrl"],
    required: true,
  },
} as const satisfies Record<string, EmailActionMeta>;

/** Ein Action-Key aus {@link EMAIL_ACTIONS}. */
export type EmailActionKey = keyof typeof EMAIL_ACTIONS;

/** Bequemer Namespace für Action-Keys (statt Magic-Strings an Call-Sites). */
export const EmailAction = {
  AdminInviteSent: "adminInviteSent",
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
