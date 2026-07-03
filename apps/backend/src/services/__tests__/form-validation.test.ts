/**
 * @file Tests for the hand-rolled form-submission validation (MC-082). The
 * behavior spec is lmaa.space's zod-based `form-validation.ts` with two
 * deliberate tightenings: `required` rejects empty strings, and
 * select/multi-select values must be members of the field's `options`.
 */

import type { FormRow } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";

import { validateFormSubmission } from "../form-validation.js";

function rows(fields: FormRow["fields"]): FormRow[] {
  return [{ id: "r1", fields }];
}

describe("validateFormSubmission", () => {
  it("accepts a valid submission and strips undeclared keys", () => {
    const result = validateFormSubmission(
      rows([
        { id: "f1", name: "message", type: "textarea", label: "Message", required: true },
        { id: "f2", name: "email", type: "email", label: "Email", required: false },
      ]),
      { message: "Hello", email: "jane@example.com", sneaky: "dropped" },
    );

    expect(result).toEqual({ ok: true, data: { message: "Hello", email: "jane@example.com" } });
  });

  it("rejects a non-object body", () => {
    const result = validateFormSubmission(rows([]), "nope");
    expect(result.ok).toBe(false);
  });

  it("flags a missing required field", () => {
    const result = validateFormSubmission(
      rows([{ id: "f1", name: "message", type: "text", label: "Message", required: true }]),
      {},
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.field).toBe("message");
  });

  it("flags an empty string on a required field", () => {
    const result = validateFormSubmission(
      rows([{ id: "f1", name: "message", type: "text", label: "Message", required: true }]),
      { message: "   " },
    );
    expect(result.ok).toBe(false);
  });

  it("omits an absent optional field from the result data", () => {
    const result = validateFormSubmission(
      rows([{ id: "f1", name: "note", type: "text", label: "Note", required: false }]),
      {},
    );
    expect(result).toEqual({ ok: true, data: {} });
  });

  it("rejects a malformed email address", () => {
    const result = validateFormSubmission(
      rows([{ id: "f1", name: "email", type: "email", label: "Email", required: true }]),
      { email: "not-an-email" },
    );
    expect(result.ok).toBe(false);
  });

  it("enforces min and max string length", () => {
    const fields = rows([
      { id: "f1", name: "code", type: "text", label: "Code", required: true, validation: { min: 3, max: 5 } },
    ]);
    expect(validateFormSubmission(fields, { code: "ab" }).ok).toBe(false);
    expect(validateFormSubmission(fields, { code: "abcdef" }).ok).toBe(false);
    expect(validateFormSubmission(fields, { code: "abcd" }).ok).toBe(true);
  });

  it("caps unbounded text fields at the 5000-character default", () => {
    const result = validateFormSubmission(
      rows([{ id: "f1", name: "message", type: "textarea", label: "Message", required: true }]),
      { message: "x".repeat(5001) },
    );
    expect(result.ok).toBe(false);
  });

  it("enforces an admin-defined pattern but ignores an invalid one", () => {
    const patternFields = rows([
      { id: "f1", name: "zip", type: "text", label: "Zip", required: true, validation: { pattern: "^\\d{5}$" } },
    ]);
    expect(validateFormSubmission(patternFields, { zip: "12345" }).ok).toBe(true);
    expect(validateFormSubmission(patternFields, { zip: "abc" }).ok).toBe(false);

    const brokenPattern = rows([
      { id: "f1", name: "x", type: "text", label: "X", required: true, validation: { pattern: "([" } },
    ]);
    expect(validateFormSubmission(brokenPattern, { x: "anything" }).ok).toBe(true);
  });

  it("requires select values to be one of the field's options", () => {
    const fields = rows([
      { id: "f1", name: "topic", type: "select", label: "Topic", required: true, options: ["bug", "idea"] },
    ]);
    expect(validateFormSubmission(fields, { topic: "bug" }).ok).toBe(true);
    expect(validateFormSubmission(fields, { topic: "other" }).ok).toBe(false);
  });

  it("validates multi-select as an option-member array with a 100-element cap", () => {
    const fields = rows([
      { id: "f1", name: "tags", type: "multi-select", label: "Tags", required: false, options: ["a", "b", "c"] },
    ]);
    expect(validateFormSubmission(fields, { tags: ["a", "c"] }).ok).toBe(true);
    expect(validateFormSubmission(fields, { tags: "a" }).ok).toBe(false);
    expect(validateFormSubmission(fields, { tags: ["nope"] }).ok).toBe(false);
    expect(validateFormSubmission(fields, { tags: Array.from({ length: 101 }, () => "a") }).ok).toBe(false);
  });

  it("accepts boolean or string checkboxes and rejects other types", () => {
    const fields = rows([{ id: "f1", name: "consent", type: "checkbox", label: "Consent", required: false }]);
    expect(validateFormSubmission(fields, { consent: true }).ok).toBe(true);
    expect(validateFormSubmission(fields, { consent: "on" }).ok).toBe(true);
    expect(validateFormSubmission(fields, { consent: 1 }).ok).toBe(false);
  });

  it("never validates display-only fields, even when marked required", () => {
    const result = validateFormSubmission(
      rows([
        { id: "f1", type: "headline", label: "Heading", required: true },
        { id: "f2", type: "button", label: "Send", required: true },
        { id: "f3", type: "richtext", label: "", required: true, content: "**info**" },
      ]),
      {},
    );
    expect(result).toEqual({ ok: true, data: {} });
  });

  it("falls back to the field id as submission key when no name is set", () => {
    const result = validateFormSubmission(rows([{ id: "field-abc", type: "text", label: "X", required: true }]), {
      "field-abc": "value",
    });
    expect(result).toEqual({ ok: true, data: { "field-abc": "value" } });
  });
});
