import { describe, expect, it } from "vitest";
import { EmailBlockType } from "../email-blocks.js";
import {
  EMAIL_VARIABLES,
  EmailRecipientKind,
  EmailVariableScope,
  extractEmailTemplateVariables,
  getEmailVariableMeta,
  listAvailableEmailVariables,
} from "../email-variables.js";

describe("extractEmailTemplateVariables", () => {
  it("extracts {{var}} placeholders from the subject", () => {
    expect(extractEmailTemplateVariables("Welcome {{username}}", [])).toEqual(["username"]);
  });

  it("extracts from a text block's markdown", () => {
    expect(
      extractEmailTemplateVariables("", [{ type: EmailBlockType.Text, markdown: "Hi {{username}}, code {{token}}" }]),
    ).toEqual(["username", "token"]);
  });

  it("extracts from a button block's url", () => {
    expect(
      extractEmailTemplateVariables("", [{ type: EmailBlockType.Button, label: "Activate", url: "{{inviteUrl}}" }]),
    ).toEqual(["inviteUrl"]);
  });

  it("does NOT scan a button block's label (labels are never interpolated)", () => {
    expect(
      extractEmailTemplateVariables("", [{ type: EmailBlockType.Button, label: "Hi {{username}}", url: "https://x" }]),
    ).toEqual([]);
  });

  it("ignores block types that carry no interpolated text (image/divider/spacer)", () => {
    expect(
      extractEmailTemplateVariables("", [
        { type: EmailBlockType.Image, assetId: "a", altText: "{{username}}" },
        { type: EmailBlockType.Divider },
        { type: EmailBlockType.Spacer, heightPx: 10 },
      ]),
    ).toEqual([]);
  });

  it("deduplicates a variable used in several places, keeping first-seen order", () => {
    expect(
      extractEmailTemplateVariables("Hi {{username}}", [
        { type: EmailBlockType.Text, markdown: "Dear {{username}}, visit {{inviteUrl}}" },
        { type: EmailBlockType.Button, label: "Go", url: "{{inviteUrl}}" },
        { type: EmailBlockType.Text, markdown: "Your code {{token}}" },
      ]),
    ).toEqual(["username", "inviteUrl", "token"]);
  });

  it("returns an empty array when the template uses no placeholders", () => {
    expect(
      extractEmailTemplateVariables("Static subject", [{ type: EmailBlockType.Text, markdown: "No variables here." }]),
    ).toEqual([]);
  });

  it("extracts multiple distinct placeholders from a single string", () => {
    expect(extractEmailTemplateVariables("{{a}} {{b}} {{a}} {{c}}", [])).toEqual(["a", "b", "c"]);
  });
});

describe("EMAIL_VARIABLES catalog", () => {
  it("declares websiteUrl as a system variable with a sample value", () => {
    const meta = EMAIL_VARIABLES.websiteUrl;
    expect(meta.scope).toBe(EmailVariableScope.System);
    expect(meta.sampleValue.length).toBeGreaterThan(0);
    expect(meta.description.length).toBeGreaterThan(0);
  });

  it("declares every context variable used by the action registry", () => {
    expect(EMAIL_VARIABLES.inviteUrl.scope).toBe(EmailVariableScope.Context);
    expect(EMAIL_VARIABLES.verifyUrl.scope).toBe(EmailVariableScope.Context);
    expect(EMAIL_VARIABLES.resetUrl.scope).toBe(EmailVariableScope.Context);
  });

  it("restricts role to admin-user recipients", () => {
    expect(EMAIL_VARIABLES.role.recipientKinds).toEqual([EmailRecipientKind.AdminUser]);
  });
});

describe("getEmailVariableMeta", () => {
  it("returns the catalog entry for a known name", () => {
    expect(getEmailVariableMeta("verifyUrl")?.scope).toBe(EmailVariableScope.Context);
  });

  it("returns undefined for an unknown name", () => {
    expect(getEmailVariableMeta("nopeNotAVariable")).toBeUndefined();
  });
});

describe("listAvailableEmailVariables", () => {
  it("lists system + admin-user recipient variables without any context", () => {
    const names = listAvailableEmailVariables(EmailRecipientKind.AdminUser, []);
    expect(names).toEqual(
      expect.arrayContaining(["websiteUrl", "dashboardUrl", "developerUrl", "loginUrl", "username", "email", "role"]),
    );
    expect(names).not.toContain("inviteUrl");
  });

  it("omits role for developer-account recipients", () => {
    const names = listAvailableEmailVariables(EmailRecipientKind.DeveloperAccount, []);
    expect(names).toContain("username");
    expect(names).toContain("email");
    expect(names).not.toContain("role");
  });

  it("appends the given context variables", () => {
    const names = listAvailableEmailVariables(EmailRecipientKind.AdminUser, ["inviteUrl"]);
    expect(names).toContain("inviteUrl");
  });

  it("deduplicates repeated context variables", () => {
    const names = listAvailableEmailVariables(EmailRecipientKind.AdminUser, ["inviteUrl", "inviteUrl"]);
    expect(names.filter((n) => n === "inviteUrl")).toHaveLength(1);
  });
});
