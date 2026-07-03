import { describe, expect, it } from "vitest";
import { EmailBlockType } from "../email-blocks.js";
import { extractEmailTemplateVariables } from "../email-variables.js";

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
