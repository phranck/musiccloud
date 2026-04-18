import { requireEnv } from "../lib/env.js";
import { renderEmailTemplate } from "./email-renderer.js";
import { getManagedEmailTemplateById } from "./email-templates.js";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export interface SendTemplatedEmailInput {
  templateId: number;
  to: { email: string; name?: string };
  variables: Record<string, string>;
}

export async function sendTemplatedEmail(input: SendTemplatedEmailInput): Promise<void> {
  const apiKey = requireEnv("BREVO_API_KEY");
  const fromEmail = requireEnv("EMAIL_FROM_ADDRESS");
  const fromName = requireEnv("EMAIL_FROM_NAME");
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

  const response = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: input.to.email, ...(input.to.name ? { name: input.to.name } : {}) }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Brevo API error (${response.status}): ${body}`);
  }
}
