import { EmailBlockType, parseDesignTokens } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import type { EmailBrandingDto, EmailTemplateBrandingOverrides } from "../../db/admin-repository.js";
import { renderBlocks, renderEmailPreview, resolveBranding } from "../email-renderer.js";
import { EmailColorScheme, resolveEmailSurfaces } from "../email-surfaces.js";

/** Global branding default with the website night-sky shader gradient colours. */
const GLOBAL: EmailBrandingDto = {
  headerAssetId: null,
  footerText: "share it everywhere",
  lightBackgroundAssetId: null,
  darkBackgroundAssetId: null,
  lightGradientTop: "#0076d5",
  lightGradientBottom: "#69d1fd",
  darkGradientTop: "#0b1318",
  darkGradientBottom: "#10273b",
};
const NO_OVERRIDES: Partial<EmailTemplateBrandingOverrides> = {};
const baseUrl = "http://localhost:4000";

// The canonical token set, which is what an installation that has never been
// tuned renders with, and the same values `getDesignTokens` falls back to.
const TOKENS = parseDesignTokens(null).tokens;

describe("resolveBranding", () => {
  it("falls back to the global default for every absent override field", () => {
    expect(resolveBranding({}, GLOBAL)).toEqual({
      headerAssetId: null,
      footerText: "share it everywhere",
      lightBackgroundAssetId: null,
      darkBackgroundAssetId: null,
      lightGradientTop: "#0076d5",
      lightGradientBottom: "#69d1fd",
      darkGradientTop: "#0b1318",
      darkGradientBottom: "#10273b",
    });
  });

  it("lets a non-null override win per field, independently of the other fields", () => {
    const resolved = resolveBranding({ lightGradientTop: "#111111", footerText: "custom footer" }, GLOBAL);
    expect(resolved.lightGradientTop).toBe("#111111"); // overridden
    expect(resolved.footerText).toBe("custom footer"); // overridden
    expect(resolved.lightGradientBottom).toBe("#69d1fd"); // still global
    expect(resolved.darkGradientTop).toBe("#0b1318"); // still global
  });

  it("treats an explicit null override as 'inherit the global', not 'clear the field'", () => {
    const global: EmailBrandingDto = { ...GLOBAL, headerAssetId: "global-header" };
    expect(resolveBranding({ headerAssetId: null }, global).headerAssetId).toBe("global-header");
  });
});

describe("renderBlocks", () => {
  it("interpolates variables in text and button blocks", () => {
    const html = renderBlocks(
      [
        { type: EmailBlockType.Text, markdown: "Hello {{username}}" },
        { type: EmailBlockType.Button, label: "Activate", url: "{{inviteUrl}}" },
      ],
      NO_OVERRIDES,
      GLOBAL,
      { username: "Alice", inviteUrl: "https://x/y" },
      baseUrl,
      TOKENS,
    );
    expect(html).toContain("Alice");
    expect(html).toContain("https://x/y");
    expect(html).toContain("Activate");
  });

  it("renders the global footer text once", () => {
    const html = renderBlocks(
      [{ type: EmailBlockType.Text, markdown: "Body" }],
      NO_OVERRIDES,
      GLOBAL,
      {},
      baseUrl,
      TOKENS,
    );
    expect(html).toContain("share it everywhere");
  });

  it("points an image block at the asset route", () => {
    const html = renderBlocks(
      [{ type: EmailBlockType.Image, assetId: "abc", altText: "banner" }],
      NO_OVERRIDES,
      GLOBAL,
      {},
      baseUrl,
      TOKENS,
    );
    expect(html).toContain("/api/admin/email-assets/abc");
    expect(html).toContain('alt="banner"');
  });

  it("builds an absolute asset URL from baseUrl for the live-send path", () => {
    const html = renderBlocks(
      [{ type: EmailBlockType.Image, assetId: "abc", altText: "" }],
      { headerAssetId: "header1" },
      GLOBAL,
      {},
      baseUrl,
      TOKENS,
    );
    expect(html).toContain(`src="${baseUrl}/api/admin/email-assets/abc"`);
    expect(html).toContain(`src="${baseUrl}/api/admin/email-assets/header1"`);
  });

  it("leaves a placeholder literal when its name isn't in the variables map, instead of blanking it", () => {
    const html = renderBlocks(
      [{ type: EmailBlockType.Text, markdown: "Hello {{username}}, ref {{notSupplied}}" }],
      NO_OVERRIDES,
      GLOBAL,
      { username: "Alice" },
      baseUrl,
      TOKENS,
    );
    expect(html).toContain("Alice");
    expect(html).toContain("{{notSupplied}}");
  });
});

describe("renderBlocks — page background (send path)", () => {
  const body = [{ type: EmailBlockType.Text, markdown: "Body" }] as const;

  it("always paints the light gradient (plus a solid-colour fallback) on the page-bg cell", () => {
    const html = renderBlocks([...body], NO_OVERRIDES, GLOBAL, {}, baseUrl, TOKENS);
    expect(html).toContain('class="em-page-bg"');
    expect(html).toContain("linear-gradient(180deg, #0076d5, #69d1fd)");
    expect(html).toContain("background-color:#69d1fd");
  });

  it("omits the image layer when no light background image is set", () => {
    const html = renderBlocks([...body], NO_OVERRIDES, GLOBAL, {}, baseUrl, TOKENS);
    expect(html).not.toContain("url(");
  });

  it("layers the light background image over the gradient when set", () => {
    const html = renderBlocks([...body], { lightBackgroundAssetId: "bg-light" }, GLOBAL, {}, baseUrl, TOKENS);
    expect(html).toContain(
      `url(${baseUrl}/api/admin/email-assets/bg-light), linear-gradient(180deg, #0076d5, #69d1fd)`,
    );
  });

  it("never tiles the background: no-repeat on both <body> and the page-bg cell, and no tiling legacy background attribute", () => {
    const html = renderBlocks([...body], { lightBackgroundAssetId: "bg-light" }, GLOBAL, {}, baseUrl, TOKENS);
    const bodyTag = html.match(/<body style="([^"]*)"/)?.[1] ?? "";
    const cellTag = html.match(/<td[^>]*class="em-page-bg"[^>]*style="([^"]*)"/)?.[1] ?? "";
    expect(bodyTag).toContain("background-repeat:no-repeat");
    expect(cellTag).toContain("background-repeat:no-repeat");
    // The legacy `background="..."` HTML attribute tiles in old Outlook (no
    // non-VML way to stop it) and must never be emitted.
    expect(html).not.toContain('background="');
  });

  it("emits a dark-mode @media block overriding the page background with the dark gradient", () => {
    const html = renderBlocks([...body], NO_OVERRIDES, GLOBAL, {}, baseUrl, TOKENS);
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain("linear-gradient(180deg, #0b1318, #10273b) !important");
  });

  it("uses a per-template gradient override in the rendered light background", () => {
    const html = renderBlocks(
      [...body],
      { lightGradientTop: "#123456", lightGradientBottom: "#abcdef" },
      GLOBAL,
      {},
      baseUrl,
      TOKENS,
    );
    expect(html).toContain("linear-gradient(180deg, #123456, #abcdef)");
  });

  it("gives the page-bg cell 80px top/bottom padding (double the 16px side inset) around the card", () => {
    const html = renderBlocks([...body], NO_OVERRIDES, GLOBAL, {}, baseUrl, TOKENS);
    const cellTag = html.match(/<td[^>]*class="em-page-bg"[^>]*style="([^"]*)"/)?.[1] ?? "";
    expect(cellTag).toContain("padding:80px 16px;");
  });

  it("also paints the light gradient on <body>, so the sky fills the viewport beyond the email's own content height", () => {
    const html = renderBlocks([...body], NO_OVERRIDES, GLOBAL, {}, baseUrl, TOKENS);
    const bodyTag = html.match(/<body style="([^"]*)"/)?.[1] ?? "";
    expect(bodyTag).toContain("background-color:#69d1fd");
    expect(bodyTag).toContain("background-image:linear-gradient(180deg, #0076d5, #69d1fd)");
  });

  it("also overrides <body>'s background in the dark-mode @media block, not just the page-bg cell", () => {
    const html = renderBlocks([...body], NO_OVERRIDES, GLOBAL, {}, baseUrl, TOKENS);
    const darkBlock = html.match(/@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\}\s*<\/style>/)?.[1] ?? "";
    expect(darkBlock).toContain("body {");
    expect(darkBlock).toContain("background-color:#10273b !important");
  });
});

describe("renderBlocks — card styling", () => {
  it("gives the content card a drop shadow via a non-clipping wrapper cell", () => {
    const html = renderBlocks(
      [{ type: EmailBlockType.Text, markdown: "Body" }],
      NO_OVERRIDES,
      GLOBAL,
      {},
      baseUrl,
      TOKENS,
    );
    expect(html).toMatch(/box-shadow:[^"]*rgba\(/);
  });

  it("paints the card, the wells and the button from the design tokens, not from values of its own", () => {
    const surfaces = resolveEmailSurfaces(TOKENS, EmailColorScheme.Light);
    const html = renderBlocks(
      [
        { type: EmailBlockType.Text, markdown: "Body" },
        { type: EmailBlockType.Button, label: "Go", url: "https://example.com" },
      ],
      NO_OVERRIDES,
      GLOBAL,
      {},
      baseUrl,
      TOKENS,
    );

    expect(html).toContain(`background:${surfaces.card.fill}`);
    expect(html).toContain(`background:${surfaces.well.fill}`);
    expect(html).toContain(`background:${surfaces.button.fill}`);
    expect(html).toContain(`border-radius:${surfaces.card.radiusPx}px`);
    expect(html).toContain(`border-radius:${surfaces.well.radiusPx}px`);
    expect(html).toContain(`border-radius:${surfaces.button.radiusPx}px`);
  });

  it("quotes the font stack so it cannot end the style attribute it sits in", () => {
    const html = renderBlocks(
      [
        { type: EmailBlockType.Text, markdown: "## Heading\n\nBody" },
        { type: EmailBlockType.Button, label: "Go", url: "https://example.com" },
      ],
      NO_OVERRIDES,
      GLOBAL,
      {},
      baseUrl,
      TOKENS,
    );

    // A double quote inside `style="…"` closes the attribute, and everything
    // after it, including the colour, is dropped without any error.
    expect(html).not.toMatch(/font-family:[^;]*"/);
    expect(html).toMatch(/<h2 style="[^"]*color:rgba/);
    expect(html).toMatch(/class="em-button"[^>]*text-decoration:none/);
  });

  it("puts every block of copy in a well, the way the share page does", () => {
    const html = renderBlocks(
      [{ type: EmailBlockType.Text, markdown: "Body" }],
      NO_OVERRIDES,
      GLOBAL,
      {},
      baseUrl,
      TOKENS,
    );
    expect(html).toMatch(/<td class="em-well"[^>]*>[^<]*<p/);
  });

  it("sets the button into a well, the way a control is set into one on the site", () => {
    const surfaces = resolveEmailSurfaces(TOKENS, EmailColorScheme.Light);
    const html = renderBlocks(
      [{ type: EmailBlockType.Button, label: "Go", url: "https://example.com" }],
      NO_OVERRIDES,
      GLOBAL,
      {},
      baseUrl,
      TOKENS,
    );

    // Well outside, control inside, separated by the control inset.
    expect(html).toMatch(
      new RegExp(
        `class="em-well"[^>]*background:${surfaces.well.fill.replace(/[().]/g, "\\$&")}[^>]*padding:${TOKENS.paddings["--mc-pad-recessed"]}px[\\s\\S]*?class="em-button-face"`,
      ),
    );
  });

  it("holds the button off the copy above it by the card's own padding", () => {
    const surfaces = resolveEmailSurfaces(TOKENS, EmailColorScheme.Light);
    const html = renderBlocks(
      [
        { type: EmailBlockType.Text, markdown: "Do the thing" },
        { type: EmailBlockType.Button, label: "Go", url: "https://example.com" },
      ],
      NO_OVERRIDES,
      GLOBAL,
      {},
      baseUrl,
      TOKENS,
    );

    const spacerBeforeButton = html.match(
      /height:(\d+)px;line-height:0;font-size:0;">&nbsp;<\/td><\/tr>\s*<tr><td align="right"/,
    );
    expect(spacerBeforeButton?.[1]).toBe(String(surfaces.card.paddingPx));
  });

  it("starts a new card after a button, so a note about the action is not part of it", () => {
    const html = renderBlocks(
      [
        { type: EmailBlockType.Text, markdown: "Do the thing" },
        { type: EmailBlockType.Button, label: "Go", url: "https://example.com" },
        { type: EmailBlockType.Text, markdown: "The link expires in an hour" },
      ],
      NO_OVERRIDES,
      GLOBAL,
      {},
      baseUrl,
      TOKENS,
    );

    expect(html.match(/class="em-card"/g)).toHaveLength(2);
  });

  it("keeps one card when nothing follows the button", () => {
    const html = renderBlocks(
      [
        { type: EmailBlockType.Text, markdown: "Do the thing" },
        { type: EmailBlockType.Button, label: "Go", url: "https://example.com" },
      ],
      NO_OVERRIDES,
      GLOBAL,
      {},
      baseUrl,
      TOKENS,
    );

    expect(html.match(/class="em-card"/g)).toHaveLength(1);
  });

  it("stands the button at the right edge of its block, where every other button in the product stands", () => {
    const html = renderBlocks(
      [{ type: EmailBlockType.Button, label: "Verify my email", url: "https://example.com" }],
      NO_OVERRIDES,
      GLOBAL,
      {},
      baseUrl,
      TOKENS,
    );
    expect(html).toMatch(/<td align="right"[^>]*>\s*<table[^>]*align="right"/);
  });

  it("repaints every surface for a dark client, so nothing keeps the light material", () => {
    const dark = resolveEmailSurfaces(TOKENS, EmailColorScheme.Dark);
    const html = renderBlocks(
      [{ type: EmailBlockType.Button, label: "Go", url: "https://example.com" }],
      NO_OVERRIDES,
      GLOBAL,
      {},
      baseUrl,
      TOKENS,
    );
    const darkBlock = html.match(/@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\}\s*@media/)?.[1] ?? "";

    expect(darkBlock).toContain(`background: ${dark.card.fill} !important`);
    expect(darkBlock).toContain(`background: ${dark.well.fill} !important`);
    expect(darkBlock).toContain(`background: ${dark.button.fill} !important`);
  });
});

describe("renderEmailPreview", () => {
  it("shows every {{variable}} placeholder literally, since preview never supplies variable values", () => {
    const html = renderEmailPreview(
      [
        { type: EmailBlockType.Text, markdown: "Hello {{username}}" },
        { type: EmailBlockType.Button, label: "Activate", url: "{{inviteUrl}}" },
      ],
      NO_OVERRIDES,
      GLOBAL,
      "light",
      TOKENS,
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
      { headerAssetId: "header1" },
      GLOBAL,
      "light",
      TOKENS,
    );
    expect(html).toContain('src="/api/admin/email-assets/abc"');
    expect(html).toContain('src="/api/admin/email-assets/header1"');
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });

  it("paints the forced dark scheme's gradient as the base background, with no dark @media query", () => {
    const html = renderEmailPreview(
      [{ type: EmailBlockType.Text, markdown: "Body" }],
      NO_OVERRIDES,
      GLOBAL,
      "dark",
      TOKENS,
    );
    expect(html).toContain("linear-gradient(180deg, #0b1318, #10273b)");
    expect(html).not.toContain("@media (prefers-color-scheme: dark)");
  });

  it("regression: a forced-dark preview's <body> tag must not carry a flat !important background rule that would beat its own inline sky gradient", () => {
    // A prior version of DARK_RULES set `body { background: #0A0A0C !important; }`.
    // `!important` in the <style> block always beats a plain (non-important)
    // inline style, so that flat rule silently blanked out the resolved dark
    // gradient on <body> — visible in the browser, invisible to a plain
    // toContain() check on the gradient string alone (the gradient string was
    // still present in the inline style, just overridden by the cascade).
    const html = renderEmailPreview(
      [{ type: EmailBlockType.Text, markdown: "Body" }],
      NO_OVERRIDES,
      GLOBAL,
      "dark",
      TOKENS,
    );
    expect(html).not.toMatch(/body\s*\{\s*background:\s*#[0-9a-fA-F]{6}\s*!important/);
  });

  it("paints the forced light scheme's gradient as the base background", () => {
    const html = renderEmailPreview(
      [{ type: EmailBlockType.Text, markdown: "Body" }],
      NO_OVERRIDES,
      GLOBAL,
      "light",
      TOKENS,
    );
    expect(html).toContain("linear-gradient(180deg, #0076d5, #69d1fd)");
  });

  it("also paints the forced scheme's gradient on <body>, so the preview fills the whole iframe height", () => {
    const html = renderEmailPreview(
      [{ type: EmailBlockType.Text, markdown: "Body" }],
      NO_OVERRIDES,
      GLOBAL,
      "dark",
      TOKENS,
    );
    const bodyTag = html.match(/<body style="([^"]*)"/)?.[1] ?? "";
    expect(bodyTag).toContain("background-color:#10273b");
    expect(bodyTag).toContain("background-image:linear-gradient(180deg, #0b1318, #10273b)");
  });
});
