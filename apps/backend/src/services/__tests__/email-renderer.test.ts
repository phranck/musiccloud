import { EmailBlockType } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { renderBlocks, renderEmailPreview } from "../email-renderer.js";

const branding = { headerAssetId: null, footerAssetId: null, footerText: "share it everywhere" };
const baseUrl = "http://localhost:4000";

describe("renderBlocks", () => {
  it("interpolates variables in text and button blocks", () => {
    const html = renderBlocks(
      [
        { type: EmailBlockType.Text, markdown: "Hello {{username}}" },
        { type: EmailBlockType.Button, label: "Activate", url: "{{inviteUrl}}" },
      ],
      branding,
      { username: "Alice", inviteUrl: "https://x/y" },
      baseUrl,
    );
    expect(html).toContain("Alice");
    expect(html).toContain("https://x/y");
    expect(html).toContain("Activate");
  });

  it("renders the global footer text once", () => {
    const html = renderBlocks([{ type: EmailBlockType.Text, markdown: "Body" }], branding, {}, baseUrl);
    expect(html).toContain("share it everywhere");
  });

  it("points an image block at the asset route", () => {
    const html = renderBlocks(
      [{ type: EmailBlockType.Image, assetId: "abc", altText: "banner" }],
      branding,
      {},
      baseUrl,
    );
    expect(html).toContain("/api/admin/email-assets/abc");
    expect(html).toContain('alt="banner"');
  });

  it("leaves a placeholder literal when its name isn't in the variables map, instead of blanking it", () => {
    const html = renderBlocks(
      [{ type: EmailBlockType.Text, markdown: "Hello {{username}}, ref {{notSupplied}}" }],
      branding,
      { username: "Alice" },
      baseUrl,
    );
    expect(html).toContain("Alice");
    expect(html).toContain("{{notSupplied}}");
  });
});

describe("renderEmailPreview", () => {
  it("shows every {{variable}} placeholder literally, since preview never supplies variable values", () => {
    const html = renderEmailPreview(
      [
        { type: EmailBlockType.Text, markdown: "Hello {{username}}" },
        { type: EmailBlockType.Button, label: "Activate", url: "{{inviteUrl}}" },
      ],
      branding,
      "light",
      baseUrl,
    );
    expect(html).toContain("{{username}}");
    expect(html).toContain("{{inviteUrl}}");
  });
});
