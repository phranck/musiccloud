import { requireEnv } from "../lib/env.js";
import { sendEmail } from "./email-provider.js";
import { renderEmailTemplate } from "./email-renderer.js";
import { getManagedEmailTemplateById } from "./email-templates.js";

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
 * Render a managed email template and send it via the configured email
 * provider (SMTP2GO). The rendering pipeline (template lookup + variable
 * substitution + banner-URL resolution against `PUBLIC_URL`) is unchanged; only
 * the transport now goes through {@link sendEmail}.
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

  const { html, subject } = await renderEmailTemplate(
    {
      subject: template.subject,
      headerBannerUrl: template.headerBannerUrl,
      headerText: template.headerText,
      bodyText: template.bodyText,
      footerBannerUrl: template.footerBannerUrl,
      footerText: template.footerText,
    },
    input.variables,
    baseUrl,
  );

  await sendEmail({ to: input.to, subject, html });
}
