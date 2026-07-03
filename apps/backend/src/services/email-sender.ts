import { requireEnv } from "../lib/env.js";
import { sendEmail } from "./email-provider.js";
import { renderEmailTemplate } from "./email-renderer.js";
import { getManagedEmailBranding, getManagedEmailTemplateById } from "./email-templates.js";

/**
 * Input for {@link sendTemplatedEmail}: which managed template to render, the
 * recipient, and the variables substituted into the template body.
 */
export interface SendTemplatedEmailInput {
  /** Id of the managed email template to render. */
  templateId: number;
  /** Recipient address and optional display name. */
  to: { email: string; name?: string };
  /** `{{name}}`-style variables substituted into the rendered template. */
  variables: Record<string, string>;
}

/**
 * Renders a managed email template's blocks (wrapped by the global branding
 * singleton) and sends it via the configured email provider (SMTP2GO). Asset
 * URLs embedded in the rendered HTML are resolved against `PUBLIC_URL`.
 *
 * @param input - template id, recipient and substitution variables.
 * @throws Error when the template is missing or the provider rejects the send.
 */
export async function sendTemplatedEmail(input: SendTemplatedEmailInput): Promise<void> {
  const baseUrl = requireEnv("PUBLIC_URL");

  const templateResult = await getManagedEmailTemplateById(input.templateId);
  if (!templateResult.ok) {
    throw new Error(`Email template not found: id=${input.templateId}`);
  }
  const template = templateResult.data;
  const branding = await getManagedEmailBranding();

  const { html, subject } = renderEmailTemplate(
    { subject: template.subject, blocks: template.blocks },
    template.branding,
    branding,
    input.variables,
    baseUrl,
  );

  await sendEmail({ to: input.to, subject, html });
}
