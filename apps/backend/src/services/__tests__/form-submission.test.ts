/**
 * @file Service tests for the form submission pipeline (MC-082,
 * `executeSubmissionChain`): sequential step execution against a fully
 * stubbed {@link AdminRepository} and a mocked {@link sendEmail} — the real
 * {@link renderEmailTemplate} runs for the template path. Mirrors the mocking
 * conventions of `email-actions.test.ts`.
 */

import type { FormRow, SubmissionConfig } from "@musiccloud/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminRepository, EmailBrandingDto, EmailTemplateRow } from "../../db/admin-repository.js";
import { getAdminRepository } from "../../db/index.js";
import { sendEmail } from "../email-provider.js";
import { deriveSubmitterEmail, executeSubmissionChain } from "../form-submission.js";

vi.mock("../../db/index.js", () => ({
  getAdminRepository: vi.fn(),
}));

vi.mock("../email-provider.js", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

const BRANDING: EmailBrandingDto = {
  headerAssetId: null,
  footerAssetId: null,
  footerText: null,
  lightBackgroundAssetId: null,
  darkBackgroundAssetId: null,
  lightGradientTop: "#0076d5",
  lightGradientBottom: "#69d1fd",
  darkGradientTop: "#0b1318",
  darkGradientBottom: "#10273b",
};

/** Contact-form-like field grid: named message field + email field, plus a display-only button. */
const ROWS: FormRow[] = [
  {
    id: "r1",
    fields: [
      { id: "f-msg", name: "message", type: "textarea", label: "Message", required: true },
      { id: "f-mail", name: "senderEmail", type: "email", label: "Your email", required: true },
      { id: "f-btn", type: "button", label: "Send", required: false, buttonType: "submit" },
    ],
  },
];

const FORM = { id: 42, name: "contact", rows: ROWS };

function makeTemplateRow(overrides: Partial<EmailTemplateRow> = {}): EmailTemplateRow {
  return {
    id: 7,
    name: "Contact notification",
    subject: "New message from {{senderEmail}}",
    blocks: [{ type: "text", markdown: "Message: {{message}}" }],
    isSystemTemplate: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    branding: {
      headerAssetId: null,
      footerAssetId: null,
      footerText: null,
      lightBackgroundAssetId: null,
      darkBackgroundAssetId: null,
      lightGradientTop: null,
      lightGradientBottom: null,
      darkGradientTop: null,
      darkGradientBottom: null,
    },
    ...overrides,
  };
}

function makeRepo(): AdminRepository {
  return {
    insertFormSubmission: vi.fn(async () => ({ id: 1 })),
    getEmailTemplateById: vi.fn(async () => null),
    getEmailBranding: vi.fn(async () => BRANDING),
  } as unknown as AdminRepository;
}

let repo: AdminRepository;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PUBLIC_URL", "https://musiccloud.example");
  repo = makeRepo();
  vi.mocked(getAdminRepository).mockResolvedValue(repo);
});

describe("executeSubmissionChain", () => {
  it("stores a submission with the derived submitter email", async () => {
    const config: SubmissionConfig = { steps: [{ type: "store" }] };

    await executeSubmissionChain(config, { message: "Hi", senderEmail: "jane@example.com" }, FORM);

    expect(vi.mocked(repo.insertFormSubmission)).toHaveBeenCalledWith({
      formConfigId: 42,
      data: { message: "Hi", senderEmail: "jane@example.com" },
      submitterEmail: "jane@example.com",
    });
  });

  it("sends a plain key-value table to the fixed address when no template is set", async () => {
    const config: SubmissionConfig = { steps: [{ type: "email", to: "admin@musiccloud.example" }] };

    await executeSubmissionChain(config, { message: "<b>bold</b>", senderEmail: "jane@example.com" }, FORM);

    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(sendEmail).mock.calls[0]![0];
    expect(sent.to).toEqual({ email: "admin@musiccloud.example" });
    expect(sent.subject).toBe("New form submission: contact");
    expect(sent.html).toContain("<table");
    expect(sent.html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(sent.html).not.toContain("<b>bold</b>");
  });

  it("resolves toFieldId through the field's submission key and sets replyTo", async () => {
    const config: SubmissionConfig = {
      steps: [{ type: "email", to: "unused@musiccloud.example", toFieldId: "f-mail", replyToFieldId: "f-mail" }],
    };

    await executeSubmissionChain(config, { message: "Hi", senderEmail: "jane@example.com" }, FORM);

    const sent = vi.mocked(sendEmail).mock.calls[0]![0];
    expect(sent.to).toEqual({ email: "jane@example.com" });
    expect(sent.replyTo).toBe("jane@example.com");
  });

  it("renders through the referenced email template with form fields as variables", async () => {
    vi.mocked(repo.getEmailTemplateById).mockResolvedValueOnce(makeTemplateRow());
    const config: SubmissionConfig = {
      steps: [{ type: "email", to: "admin@musiccloud.example", templateId: 7 }],
    };

    await executeSubmissionChain(config, { message: "Hello there", senderEmail: "jane@example.com" }, FORM);

    const sent = vi.mocked(sendEmail).mock.calls[0]![0];
    expect(sent.subject).toBe("New message from jane@example.com");
    expect(sent.html).toContain("Hello there");
  });

  it("falls back to the plain table when the referenced template no longer exists", async () => {
    vi.mocked(repo.getEmailTemplateById).mockResolvedValueOnce(null);
    const config: SubmissionConfig = {
      steps: [{ type: "email", to: "admin@musiccloud.example", subject: "Custom subject", templateId: 999 }],
    };

    await executeSubmissionChain(config, { message: "Hi", senderEmail: "jane@example.com" }, FORM);

    const sent = vi.mocked(sendEmail).mock.calls[0]![0];
    expect(sent.subject).toBe("Custom subject");
    expect(sent.html).toContain("<table");
  });

  it("runs steps sequentially and propagates a step failure without running later steps", async () => {
    vi.mocked(repo.insertFormSubmission).mockRejectedValueOnce(new Error("db down"));
    const config: SubmissionConfig = {
      steps: [{ type: "store" }, { type: "email", to: "admin@musiccloud.example" }],
    };

    await expect(
      executeSubmissionChain(config, { message: "Hi", senderEmail: "jane@example.com" }, FORM),
    ).rejects.toThrow(/db down/);
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
});

describe("deriveSubmitterEmail", () => {
  it("prefers the replyToFieldId field's value", () => {
    const config: SubmissionConfig = {
      steps: [{ type: "email", to: "x@y.z", replyToFieldId: "f-mail" }],
    };
    expect(deriveSubmitterEmail(config, ROWS, { senderEmail: "reply@example.com" })).toBe("reply@example.com");
  });

  it("falls back to the first email-type field's value", () => {
    const config: SubmissionConfig = { steps: [{ type: "store" }] };
    expect(deriveSubmitterEmail(config, ROWS, { senderEmail: "first@example.com" })).toBe("first@example.com");
  });

  it("returns null when no attributable email value exists", () => {
    const config: SubmissionConfig = { steps: [{ type: "store" }] };
    expect(deriveSubmitterEmail(config, ROWS, { message: "no mail" })).toBeNull();
  });

  it("ignores values that are not email-shaped", () => {
    const config: SubmissionConfig = { steps: [{ type: "store" }] };
    expect(deriveSubmitterEmail(config, ROWS, { senderEmail: "not-an-email" })).toBeNull();
  });
});
