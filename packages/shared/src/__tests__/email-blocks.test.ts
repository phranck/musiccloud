import { describe, expect, it } from "vitest";
import { EMAIL_ACTIONS, EmailAction, getEmailActionMeta } from "../email-actions.js";
import { EmailBlockType, isEmailBlockArray } from "../email-blocks.js";

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
});

describe("email actions registry", () => {
  it("exposes adminInviteSent as required with its variables", () => {
    const meta = getEmailActionMeta(EmailAction.AdminInviteSent);
    expect(meta).toBeDefined();
    expect(meta!.required).toBe(true);
    expect(meta!.variables).toContain("inviteUrl");
  });

  it("returns undefined for an unknown key", () => {
    expect(getEmailActionMeta("nope")).toBeUndefined();
  });

  it("key namespace matches registry keys", () => {
    expect(EMAIL_ACTIONS[EmailAction.AdminInviteSent].key).toBe(EmailAction.AdminInviteSent);
  });
});
