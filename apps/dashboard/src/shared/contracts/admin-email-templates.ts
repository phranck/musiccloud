import type { EmailBlock } from "@musiccloud/shared";

/**
 * A declared template variable: the interpolation name plus a human-readable
 * description shown next to it in the block editor (e.g. so an admin editing
 * a button block's `{{inviteUrl}}` knows what it resolves to). Dashboard-local
 * mirror of the backend's `EmailTemplateVariable` DTO
 * (`apps/backend/src/db/admin-repository.ts`) — not a `@musiccloud/shared`
 * type, following this file's existing convention of mirroring backend DTO
 * shapes rather than importing backend internals.
 */
export interface EmailTemplateVariable {
  name: string;
  description: string;
}

/**
 * An email template as returned by the admin email-templates API. The body is
 * a `blocks` array (block-based email body model, MC-078) rather than the
 * flat header/body/footer text fields the pre-MC-078 template shape used;
 * `requiredVariables` declares which `{{var}}` placeholders the template
 * expects an action to supply, gating `POST .../bindings` compatibility
 * checks and the test-send flow.
 */
export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  blocks: EmailBlock[];
  requiredVariables: EmailTemplateVariable[];
  isSystemTemplate: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Shape accepted by create/update calls: every editable field except server-assigned/read-only ones. */
export type EmailTemplateInput = Omit<EmailTemplate, "id" | "createdAt" | "updatedAt" | "isSystemTemplate">;
