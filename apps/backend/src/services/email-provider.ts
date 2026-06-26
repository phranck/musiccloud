import { requireEnv } from "../lib/env.js";

/**
 * A single transactional email, ready to hand to the email provider. The body
 * is already-rendered HTML; the optional plain-text alternative improves
 * deliverability and accessibility but is not required.
 */
export interface EmailMessage {
  /** Recipient address and optional display name. */
  to: { email: string; name?: string };
  /** Rendered subject line. */
  subject: string;
  /** Rendered HTML body. */
  html: string;
  /** Optional plain-text alternative. */
  text?: string;
}

/**
 * SMTP2GO send endpoint. The EU host keeps message processing and data within
 * the Amsterdam data center (EU residency), which the global host would not
 * guarantee. See the `email-smtp2go` project memory.
 */
const SMTP2GO_ENDPOINT = "https://eu-api.smtp2go.com/v3/email/send";

/**
 * Format an address the way SMTP2GO expects it in `sender`/`to`: `Name <email>`
 * when a display name is present, otherwise the bare address.
 *
 * @param email - the email address.
 * @param name - optional display name.
 * @returns the formatted address string.
 */
function formatAddress(email: string, name?: string): string {
  return name ? `${name} <${email}>` : email;
}

/**
 * Shape of the SMTP2GO `/v3/email/send` response we care about. A 200 can still
 * carry per-recipient failures, so `succeeded`/`failed` must be inspected — a
 * plain `response.ok` check is not sufficient.
 */
interface Smtp2goResponse {
  data?: {
    succeeded?: number;
    failed?: number;
    failures?: unknown[];
    error?: string;
    error_code?: string;
  };
}

/**
 * Send one transactional email through SMTP2GO's EU endpoint. The sender is
 * taken from `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME`; the API key from
 * `SMTP2GO_API_KEY` (send-only permission).
 *
 * @param message - recipient, subject and rendered HTML (optional plain text).
 * @returns nothing on success.
 * @throws Error when the HTTP call fails, or when SMTP2GO accepts the request
 *   (HTTP 200) but reports the message was not delivered (`succeeded < 1` or
 *   `failed > 0`).
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = requireEnv("SMTP2GO_API_KEY");
  const fromEmail = requireEnv("EMAIL_FROM_ADDRESS");
  const fromName = requireEnv("EMAIL_FROM_NAME");

  const response = await fetch(SMTP2GO_ENDPOINT, {
    method: "POST",
    headers: {
      "X-Smtp2go-Api-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: formatAddress(fromEmail, fromName),
      to: [formatAddress(message.to.email, message.to.name)],
      subject: message.subject,
      html_body: message.html,
      ...(message.text ? { text_body: message.text } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`SMTP2GO API error (${response.status}): ${body}`);
  }

  const result = (await response.json().catch(() => null)) as Smtp2goResponse | null;
  const data = result?.data;
  if (!data || (data.succeeded ?? 0) < 1 || (data.failed ?? 0) > 0) {
    throw new Error(`SMTP2GO send not accepted: ${JSON.stringify(data ?? result)}`);
  }
}

/**
 * Lightweight readiness probe for the email subsystem, used by `GET /health/email`.
 * Confirms the SMTP2GO transport is configured (API key + sender) and that the
 * provider host is reachable. Sends no mail and uses no send quota, so it is safe
 * to call on a frequent (per-minute) monitoring cadence.
 *
 * @returns true when the email subsystem is configured and the provider host responds.
 */
export async function isEmailProviderHealthy(): Promise<boolean> {
  if (!process.env.SMTP2GO_API_KEY || !process.env.EMAIL_FROM_ADDRESS || !process.env.EMAIL_FROM_NAME) {
    return false;
  }
  try {
    await fetch(new URL(SMTP2GO_ENDPOINT).origin, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    return true;
  } catch {
    return false;
  }
}
