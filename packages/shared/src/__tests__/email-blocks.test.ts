import { describe, expect, it } from "vitest";
import { EMAIL_ACTIONS, EmailAction, getEmailActionMeta } from "../email-actions.js";
import { EmailBlockType, isEmailBlockArray } from "../email-blocks.js";
import { EmailRecipientKind, EmailVariableScope, getEmailVariableMeta } from "../email-variables.js";

describe("isEmailBlockArray", () => {
  it("accepts a well-formed mixed block array", () => {
    expect(
      isEmailBlockArray([
        { type: EmailBlockType.Text, markdown: "Hi {{username}}" },
        { type: EmailBlockType.Button, label: "Open", url: "{{inviteUrl}}" },
        { type: EmailBlockType.Image, assetId: "a1", altText: "" },
        { type: EmailBlockType.Divider },
        { type: EmailBlockType.Spacer, heightPx: 24 },
      ]),
    ).toBe(true);
  });

  it("rejects a non-array", () => {
    expect(isEmailBlockArray({})).toBe(false);
  });

  it("rejects a button block missing url", () => {
    expect(isEmailBlockArray([{ type: EmailBlockType.Button, label: "x" }])).toBe(false);
  });

  it("rejects an unknown block type", () => {
    expect(isEmailBlockArray([{ type: "video", src: "x" }])).toBe(false);
  });

  it("accepts button urls with an allow-listed scheme", () => {
    for (const url of ["https://musiccloud.io/reset", "http://localhost:3002/x", "mailto:hi@musiccloud.io"]) {
      expect(isEmailBlockArray([{ type: EmailBlockType.Button, label: "Go", url }])).toBe(true);
    }
  });

  it("accepts button urls that are schemeless (relative path or bare {{variable}})", () => {
    for (const url of ["/reset", "{{inviteUrl}}", "https://{{domain}}/reset"]) {
      expect(isEmailBlockArray([{ type: EmailBlockType.Button, label: "Go", url }])).toBe(true);
    }
  });

  it("rejects button urls with a dangerous scheme", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"]) {
      expect(isEmailBlockArray([{ type: EmailBlockType.Button, label: "Go", url }])).toBe(false);
    }
  });
});

describe("email actions registry", () => {
  it("exposes adminInviteSent as required with its context variables and recipient kind", () => {
    const meta = getEmailActionMeta(EmailAction.AdminInviteSent);
    expect(meta).toBeDefined();
    expect(meta!.required).toBe(true);
    expect(meta!.contextVariables).toEqual(["inviteUrl"]);
    expect(meta!.recipientKind).toBe(EmailRecipientKind.AdminUser);
  });

  it("exposes the developer verification action for developer-account recipients", () => {
    const meta = getEmailActionMeta(EmailAction.DeveloperVerificationRequested);
    expect(meta).toBeDefined();
    expect(meta!.required).toBe(true);
    expect(meta!.contextVariables).toEqual(["verifyUrl"]);
    expect(meta!.recipientKind).toBe(EmailRecipientKind.DeveloperAccount);
  });

  it("exposes the developer password-reset action for developer-account recipients", () => {
    const meta = getEmailActionMeta(EmailAction.DeveloperPasswordResetRequested);
    expect(meta).toBeDefined();
    expect(meta!.required).toBe(true);
    expect(meta!.contextVariables).toEqual(["resetUrl"]);
    expect(meta!.recipientKind).toBe(EmailRecipientKind.DeveloperAccount);
  });

  it("declares every context variable in the EMAIL_VARIABLES catalog with Context scope", () => {
    for (const meta of Object.values(EMAIL_ACTIONS)) {
      for (const name of meta.contextVariables) {
        expect(getEmailVariableMeta(name)?.scope).toBe(EmailVariableScope.Context);
      }
    }
  });

  it("returns undefined for an unknown key", () => {
    expect(getEmailActionMeta("nope")).toBeUndefined();
  });

  it("key namespace matches registry keys", () => {
    expect(EMAIL_ACTIONS[EmailAction.AdminInviteSent].key).toBe(EmailAction.AdminInviteSent);
  });
});
