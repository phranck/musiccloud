/**
 * @file Hand-rolled validation of public form submissions against a form's
 * field definitions (MC-082). Behavior spec is lmaa.space's zod-based
 * `form-validation.ts`, adapted to this backend's no-zod convention, with two
 * deliberate tightenings: `required` rejects empty/whitespace-only strings,
 * and select/multi-select values must be members of the field's `options`.
 *
 * Undeclared keys in the raw body are dropped (never stored), mirroring zod's
 * default strip behavior. Display-only field types are never validated.
 */

import type { FormField, FormRow } from "@musiccloud/shared";

/** Field types that render content but never accept input — skipped entirely. */
const DISPLAY_FIELD_TYPES = new Set<FormField["type"]>(["richtext", "headline", "separator", "paragraph", "button"]);

/** Default upper bound for text fields without an explicit `validation.max`, to cap storage abuse. */
const DEFAULT_FIELD_MAX_LENGTH = 5000;
/** Default element cap for multi-select fields, to bound unbounded array submissions. */
const DEFAULT_MULTI_SELECT_MAX = 100;
/** Maximum admin-defined pattern length compiled to RegExp, to limit ReDoS exposure. */
const MAX_VALIDATION_PATTERN_LENGTH = 200;

/** Pragmatic email shape check (one `@`, non-empty local part and dotted domain). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One rejected field with a short, user-facing English message. */
export interface FormValidationIssue {
  field: string;
  message: string;
}

/** Discriminated validation outcome: cleaned data on success, per-field issues otherwise. */
export type FormValidationResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; issues: FormValidationIssue[] };

/**
 * Validates a raw submission body against a form's rows and returns the
 * cleaned data (declared, present fields only).
 *
 * @param rows - The form's row/field configuration.
 * @param raw - The untrusted request body.
 * @returns `ok` with the cleaned key-value data, or the collected issues.
 */
export function validateFormSubmission(rows: FormRow[], raw: unknown): FormValidationResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, issues: [{ field: "", message: "body must be an object" }] };
  }
  const body = raw as Record<string, unknown>;

  const data: Record<string, unknown> = {};
  const issues: FormValidationIssue[] = [];

  for (const row of rows) {
    for (const field of row.fields) {
      if (DISPLAY_FIELD_TYPES.has(field.type)) continue;
      const key = field.name ?? field.id;
      const value = body[key];

      if (isAbsent(value)) {
        if (field.required) issues.push({ field: key, message: "required" });
        continue;
      }

      const issue = validateFieldValue(field, value);
      if (issue) {
        issues.push({ field: key, message: issue });
      } else {
        data[key] = value;
      }
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, data };
}

/** Absent for validation purposes: missing, `null`, or an empty/whitespace-only string. */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/**
 * Validates one present value against its field definition.
 *
 * @returns A short message when invalid, `null` when the value passes.
 */
function validateFieldValue(field: FormField, value: unknown): string | null {
  switch (field.type) {
    case "text":
    case "email":
    case "textarea":
    case "password":
    case "select":
      return validateStringValue(field, value);
    case "multi-select":
      return validateMultiSelectValue(field, value);
    case "checkbox":
      return typeof value === "boolean" || typeof value === "string" ? null : "must be a boolean or string";
    default:
      // Unknown input type in a stored config: treat as unvalidatable but harmless.
      return null;
  }
}

/** String-family rules: type, email shape, length bounds, admin pattern, select membership. */
function validateStringValue(field: FormField, value: unknown): string | null {
  if (typeof value !== "string") return "must be a string";
  if (field.type === "email" && !EMAIL_PATTERN.test(value)) return "must be a valid email address";

  if (field.validation?.min != null && value.length < field.validation.min) {
    return `must be at least ${field.validation.min} characters`;
  }
  const max = field.validation?.max ?? DEFAULT_FIELD_MAX_LENGTH;
  if (value.length > max) return `must be at most ${max} characters`;

  if (field.validation?.pattern && field.validation.pattern.length <= MAX_VALIDATION_PATTERN_LENGTH) {
    try {
      if (!new RegExp(field.validation.pattern).test(value)) return "does not match the expected format";
    } catch {
      // Ignore an invalid admin-authored pattern rather than crashing validation.
    }
  }

  if (field.type === "select" && field.options && field.options.length > 0 && !field.options.includes(value)) {
    return "is not one of the allowed options";
  }
  return null;
}

/** Multi-select rules: array of strings/numbers, element cap, options membership. */
function validateMultiSelectValue(field: FormField, value: unknown): string | null {
  if (!Array.isArray(value)) return "must be an array";
  if (value.length > DEFAULT_MULTI_SELECT_MAX) return `must have at most ${DEFAULT_MULTI_SELECT_MAX} entries`;
  for (const entry of value) {
    if (typeof entry !== "string" && typeof entry !== "number") return "entries must be strings or numbers";
    if (field.options && field.options.length > 0 && !field.options.includes(String(entry))) {
      return "contains an entry that is not one of the allowed options";
    }
  }
  return null;
}
