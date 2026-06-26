/**
 * @file Transactional emails for the developer-account system (MC-064):
 * email verification and password reset. Both render a small, self-contained
 * dark-themed HTML message with a single brand-blue call-to-action button and
 * hand it to the shared {@link sendEmail} transport (SMTP2GO).
 *
 * The links point at the developer portal (`DEVELOPER_URL`), whose verify/reset
 * pages (MC-066) read the raw token from the query string and POST it back to
 * the backend. The raw token is therefore embedded in the URL here; only its
 * SHA-256 hash is ever persisted (see {@link generateEmailToken}).
 */
import type { DeveloperAccount } from "../db/developer-repository.js";
import { requireEnv } from "../lib/env.js";
import { sendEmail } from "./email-provider.js";

/** Brand accent used for the primary action button. */
const BRAND_BLUE = "#28a8d8";

/**
 * Renders the shared dark-themed email shell with a single primary button.
 * Centralized so the verification and reset mails stay visually identical and
 * cannot drift apart.
 *
 * @param params - The rendered copy and link for the message.
 * @param params.heading - Bold heading shown above the body text.
 * @param params.bodyText - One-line explanation of why the email was sent.
 * @param params.buttonLabel - Label of the call-to-action button.
 * @param params.buttonUrl - Absolute URL the button links to.
 * @returns The full HTML document string for the email body.
 */
function renderDeveloperEmail(params: {
  heading: string;
  bodyText: string;
  buttonLabel: string;
  buttonUrl: string;
}): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0f1115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f1115;padding:32px 0;">
      <tr>
        <td align="center">
          <table width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#171a21;border:1px solid #262b35;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#f5f7fa;">${params.heading}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#aab2c0;">${params.bodyText}</p>
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="border-radius:8px;background:${BRAND_BLUE};">
                      <a href="${params.buttonUrl}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#0f1115;text-decoration:none;">${params.buttonLabel}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7383;">If the button does not work, copy this link into your browser:<br /><span style="color:#8b93a3;">${params.buttonUrl}</span></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Sends the account-verification email for a freshly registered developer
 * account. The link carries the raw verification token; the portal's
 * `/verify` page redeems it against the backend.
 *
 * @param account - The developer account to email (its `email` is the recipient).
 * @param rawToken - The raw (unhashed) verification token for the link.
 * @returns A promise that resolves once the provider accepts the message.
 * @throws Error when `DEVELOPER_URL` is unset or the provider rejects the send.
 */
export async function sendDeveloperVerificationEmail(account: DeveloperAccount, rawToken: string): Promise<void> {
  const developerUrl = requireEnv("DEVELOPER_URL");
  const verifyUrl = `${developerUrl}/verify?token=${rawToken}`;

  const html = renderDeveloperEmail({
    heading: "Verify your email",
    bodyText: "Confirm your email address to finish setting up your musiccloud developer account.",
    buttonLabel: "Verify email",
    buttonUrl: verifyUrl,
  });

  await sendEmail({
    to: { email: account.email },
    subject: "Verify your musiccloud developer account",
    html,
  });
}

/**
 * Sends the password-reset email for a developer account. The link carries the
 * raw reset token; the portal's `/reset` page redeems it against the backend.
 *
 * @param account - The developer account to email (its `email` is the recipient).
 * @param rawToken - The raw (unhashed) reset token for the link.
 * @returns A promise that resolves once the provider accepts the message.
 * @throws Error when `DEVELOPER_URL` is unset or the provider rejects the send.
 */
export async function sendDeveloperPasswordResetEmail(account: DeveloperAccount, rawToken: string): Promise<void> {
  const developerUrl = requireEnv("DEVELOPER_URL");
  const resetUrl = `${developerUrl}/reset?token=${rawToken}`;

  const html = renderDeveloperEmail({
    heading: "Reset your password",
    bodyText: "We received a request to reset the password for your musiccloud developer account.",
    buttonLabel: "Reset password",
    buttonUrl: resetUrl,
  });

  await sendEmail({
    to: { email: account.email },
    subject: "Reset your musiccloud password",
    html,
  });
}
