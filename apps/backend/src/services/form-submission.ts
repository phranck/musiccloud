/**
 * @file Form submission pipeline (MC-082, ported from lmaa.space): executes a
 * form's configured post-submission steps sequentially. `store` persists the
 * cleaned data (with GDPR anchors), `email` notifies a fixed address or a
 * submitter-entered one — rendered through a managed email template (form
 * fields become the `{{variables}}`) or as a plain key-value table fallback.
 *
 * Step failures propagate to the caller — partial execution is not retried,
 * so the public route returns a 5xx instead of silently half-processing.
 */

import type { FormConfig, FormRow, SubmissionConfig, SubmissionStepEmail } from "@musiccloud/shared";

import { getAdminRepository } from "../db/index.js";
import { requireEnv } from "../lib/env.js";
import { escapeHtml } from "../lib/html.js";
import { sendEmail } from "./email-provider.js";
import { renderEmailTemplate } from "./email-renderer.js";

/** The subset of a form the pipeline needs: id (store FK), name (default subject), rows (field-key resolution). */
export type SubmissionFormMeta = Pick<FormConfig, "id" | "name" | "rows">;

/** Pragmatic email shape check for attribution values (mirrors `form-validation.ts`). */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Executes the submission chain defined in `config.steps`, in definition
 * order. Any step failure is propagated to the caller.
 *
 * @param config - Submission config containing the chain steps.
 * @param data - Validated field values keyed by field name/id.
 * @param form - The submitted form's id, name and rows.
 */
export async function executeSubmissionChain(
  config: SubmissionConfig,
  data: Record<string, unknown>,
  form: SubmissionFormMeta,
): Promise<void> {
  for (const step of config.steps) {
    switch (step.type) {
      case "store":
        await handleStore(config, data, form);
        break;
      case "email":
        await handleEmail(step, data, form);
        break;
    }
  }
}

/**
 * Derives the submitter's email for GDPR attribution: the value of an email
 * step's `replyToFieldId` (a contact form's "your email"), else `toFieldId`,
 * else the first `email`-type field in the form — but only when the resolved
 * value actually looks like an email address.
 *
 * @param config - The form's submission config (steps carry the field refs).
 * @param rows - The form's rows (field-id → submission-key resolution).
 * @param data - The validated submission values.
 * @returns The attributable address, or `null` when none exists.
 */
export function deriveSubmitterEmail(
  config: SubmissionConfig,
  rows: FormRow[],
  data: Record<string, unknown>,
): string | null {
  const candidates: (string | undefined)[] = [];
  for (const step of config.steps) {
    if (step.type === "email") {
      candidates.push(step.replyToFieldId, step.toFieldId);
    }
  }
  for (const row of rows) {
    for (const field of row.fields) {
      if (field.type === "email") candidates.push(field.id);
    }
  }

  for (const fieldId of candidates) {
    if (!fieldId) continue;
    const value = readFieldValue(rows, data, fieldId);
    if (typeof value === "string" && EMAIL_SHAPE.test(value)) return value;
  }
  return null;
}

/**
 * Reads a submitted value by FIELD ID: submission keys are `field.name ??
 * field.id`, so a step's field reference must be resolved through the rows
 * (looking up `data[fieldId]` directly would miss named fields).
 */
function readFieldValue(rows: FormRow[], data: Record<string, unknown>, fieldId: string): unknown {
  for (const row of rows) {
    for (const field of row.fields) {
      if (field.id === fieldId) return data[field.name ?? field.id];
    }
  }
  return undefined;
}

/** `store` step: persists the submission with the derived GDPR anchor. */
async function handleStore(
  config: SubmissionConfig,
  data: Record<string, unknown>,
  form: SubmissionFormMeta,
): Promise<void> {
  const repo = await getAdminRepository();
  await repo.insertFormSubmission({
    formConfigId: form.id,
    data,
    submitterEmail: deriveSubmitterEmail(config, form.rows, data),
  });
}

/**
 * `email` step: resolves the recipient (field value wins over the fixed
 * address), renders via the referenced managed template when set (form fields
 * become the `{{variables}}`), otherwise builds a plain escaped key-value
 * table, and sends with an optional Reply-To from the configured field.
 */
async function handleEmail(
  step: SubmissionStepEmail,
  data: Record<string, unknown>,
  form: SubmissionFormMeta,
): Promise<void> {
  const toFromField = step.toFieldId ? readFieldValue(form.rows, data, step.toFieldId) : undefined;
  const to = typeof toFromField === "string" && toFromField.length > 0 ? toFromField : step.to;

  const replyToValue = step.replyToFieldId ? readFieldValue(form.rows, data, step.replyToFieldId) : undefined;
  const replyTo = typeof replyToValue === "string" && EMAIL_SHAPE.test(replyToValue) ? replyToValue : undefined;

  let subject = step.subject ?? `New form submission: ${form.name}`;
  let html: string;

  const template = step.templateId ? await (await getAdminRepository()).getEmailTemplateById(step.templateId) : null;
  if (template) {
    const variables = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value ?? "")]));
    const branding = await (await getAdminRepository()).getEmailBranding();
    const rendered = renderEmailTemplate(
      { subject: template.subject, blocks: template.blocks },
      template.branding,
      branding,
      variables,
      requireEnv("PUBLIC_URL"),
    );
    subject = rendered.subject;
    html = rendered.html;
  } else {
    html = buildPlainTable(data);
  }

  await sendEmail({ to: { email: to }, subject, html, replyTo });
}

/** Minimal escaped key-value table for template-less notification mails. */
function buildPlainTable(data: Record<string, unknown>): string {
  const rows = Object.entries(data)
    .map(
      ([key, value]) =>
        `<tr><td style="padding:4px 8px;font-weight:600">${escapeHtml(key)}</td><td style="padding:4px 8px">${escapeHtml(String(value ?? ""))}</td></tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows}</table>`;
}
