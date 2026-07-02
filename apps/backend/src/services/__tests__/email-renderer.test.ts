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

  it("builds an absolute asset URL from baseUrl for the live-send path", () => {
    const html = renderBlocks(
      [{ type: EmailBlockType.Image, assetId: "abc", altText: "" }],
      { headerAssetId: "header1", footerAssetId: "footer1", footerText: null },
      {},
      baseUrl,
    );
    expect(html).toContain(`src="${baseUrl}/api/admin/email-assets/abc"`);
    expect(html).toContain(`src="${baseUrl}/api/admin/email-assets/header1"`);
    expect(html).toContain(`src="${baseUrl}/api/admin/email-assets/footer1"`);
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
    );
    expect(html).toContain("{{username}}");
    expect(html).toContain("{{inviteUrl}}");
  });

  it("builds a relative asset URL, never an absolute one built from PUBLIC_URL", () => {
    // Regression test: the preview iframe's srcDoc document has no origin of
    // its own, so a relative URL resolving against the dashboard's own origin
    // (proxied to the backend) is the only URL shape that works here. An
    // earlier version wrongly threaded PUBLIC_URL (the public *frontend*
    // domain, a different origin/port than the backend in local dev) through
    // to this path, producing a 404 against the wrong server.
    const html = renderEmailPreview(
      [{ type: EmailBlockType.Image, assetId: "abc", altText: "" }],
      { headerAssetId: "header1", footerAssetId: "footer1", footerText: null },
      "light",
    );
    expect(html).toContain('src="/api/admin/email-assets/abc"');
    expect(html).toContain('src="/api/admin/email-assets/header1"');
    expect(html).toContain('src="/api/admin/email-assets/footer1"');
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });
});
