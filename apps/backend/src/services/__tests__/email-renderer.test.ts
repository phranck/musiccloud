import { EmailBlockType } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { renderBlocks } from "../email-renderer.js";

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
});
