import { requireEnv } from "../lib/env.js";
import { sendEmail } from "./email-provider.js";
import { renderEmailTemplate } from "./email-renderer.js";
import { type EmailTemplate, getManagedEmailBranding } from "./email-templates.js";
import { getDesignTokens } from "./site-settings.js";

/** The parts of a managed template the renderer reads. */
export type SendableEmailTemplate = Pick<EmailTemplate, "subject" | "blocks" | "branding">;

/**
 * Input for {@link sendTemplatedEmail}: the template to render, the recipient,
 * and the variables substituted into it.
 */
export interface SendTemplatedEmailInput {
  /** The template, already loaded by the caller. */
  template: SendableEmailTemplate;
  /** Recipient address and optional display name. */
  to: { email: string; name?: string };
  /** `{{name}}` values substituted into the subject and the body. */
  variables: Record<string, string>;
}

/**
 * Renders a template wrapped in the global branding and sends it through the
 * configured provider. Every mail musiccloud sends goes through here: the
 * action trigger once per bound template, and the template editor's test send.
 * So a change to how a mail is put together reaches both, and a test send
 * shows what a recipient receives.
 *
 * Asset URLs in the rendered HTML are resolved against `PUBLIC_URL`. The
 * caller is responsible for having checked that the variables cover what the
 * template uses.
 *
 * @param input - The template, the recipient and the substitution values.
 * @throws Error when `PUBLIC_URL` is missing or the provider rejects the send.
 */
export async function sendTemplatedEmail(input: SendTemplatedEmailInput): Promise<void> {
  const baseUrl = requireEnv("PUBLIC_URL");
  const [branding, designTokens] = await Promise.all([getManagedEmailBranding(), getDesignTokens()]);

  const { html, subject } = renderEmailTemplate(
    { subject: input.template.subject, blocks: input.template.blocks },
    input.template.branding,
    branding,
    input.variables,
    baseUrl,
    designTokens,
  );

  await sendEmail({ to: input.to, subject, html });
}
