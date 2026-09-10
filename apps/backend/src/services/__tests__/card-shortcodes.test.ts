import {
  CARD_ROW_DEFAULT_SPACING_TOKEN,
  ContentContext,
  DEFAULT_CARD_COLUMNS,
  MAX_CARD_COLUMNS,
  MAX_CARD_DEPTH,
} from "@musiccloud/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { resetCardDepth } from "../markdown/card-extension.js";
import { renderMarkdown } from "../markdown/renderer.js";
import { sanitizeMarkdownHtml } from "../markdown/sanitizer.js";

/** Cards are a portal shortcode, so the portal context is what renders them. */
function renderPortal(markdown: string): Promise<string> {
  return renderMarkdown(markdown, ContentContext.DeveloperPortal);
}

/** Builds `depth` nested cards around a marker, so a limit can be walked up to. */
function nestedCards(depth: number, innermost: string): string {
  let markdown = innermost;
  for (let level = 0; level < depth; level += 1) markdown = `[[card {\n${markdown}\n}]]`;
  return markdown;
}

beforeEach(() => {
  resetCardDepth();
});

describe("[[card]]", () => {
  it("renders the portal's card surface", async () => {
    const out = await renderPortal("[[card {\nSome copy.\n}]]");

    expect(out).toContain('<div class="mc-card">');
    expect(out).toContain("Some copy.");
  });

  it("renders its content as page content rather than as text", async () => {
    const out = await renderPortal("[[card {\n## A heading\n\nA paragraph with **weight**.\n}]]");

    expect(out).toMatch(/<h2[^>]*>A heading<\/h2>/);
    expect(out).toContain("<strong>weight</strong>");
  });

  it("lets another shortcode stand inside it", async () => {
    const out = await renderPortal("[[card {\nStatus: [[pill:Beta tone=info]]\n}]]");

    expect(out).toContain('<span class="mc-pill mc-pill-info">Beta</span>');
  });

  it("leaves the source as text where no card is written", async () => {
    const out = await renderPortal("Not a card: [[cardigan]]");

    expect(out).not.toContain("mc-card");
    expect(out).toContain("[[cardigan]]");
  });

  it("is not offered on the site, which has no card surface", async () => {
    // Rendering it there would produce an unstyled block, so the context mask
    // refuses the page rather than serving one that looks broken.
    await expect(renderMarkdown("[[card {\nSome copy.\n}]]", ContentContext.Frontend)).rejects.toThrow(
      /only allowed in Developer Portal/,
    );
  });
});

describe("[[cards]]", () => {
  it("stands its cards side by side, at the declared column count", async () => {
    const out = await renderPortal("[[cards columns=3 {\n[[card {\nOne\n}]]\n[[card {\nTwo\n}]]\n}]]");

    expect(out).toContain('class="mc-cards mc-cards--3"');
    expect(out.match(/<div class="mc-card">/g)).toHaveLength(2);
  });

  it("takes the declared default when no column count is written", async () => {
    const out = await renderPortal("[[cards {\n[[card {\nOne\n}]]\n}]]");

    expect(out).toContain(`mc-cards--${DEFAULT_CARD_COLUMNS}`);
  });

  it("refuses a column count past the widest row and falls back to the default", async () => {
    const out = await renderPortal(`[[cards columns=${MAX_CARD_COLUMNS + 1} {\n[[card {\nOne\n}]]\n}]]`);

    expect(out).toContain(`mc-cards--${DEFAULT_CARD_COLUMNS}`);
  });

  it("leaves the gap to the stylesheet unless the page names one", async () => {
    // The registry states the default as a custom property, so the row carries
    // no gap of its own and the stylesheet's value stands.
    expect(CARD_ROW_DEFAULT_SPACING_TOKEN.startsWith("var(--")).toBe(true);

    const out = await renderPortal("[[cards {\n[[card {\nOne\n}]]\n}]]");
    expect(out).not.toContain("style=");
  });

  it("carries the gap a page asks for", async () => {
    const out = await renderPortal("[[cards spacing=32 {\n[[card {\nOne\n}]]\n}]]");

    expect(out).toContain('style="gap:32px"');
  });

  it("keeps that gap through the sanitizer", async () => {
    const out = sanitizeMarkdownHtml(await renderPortal("[[cards spacing=32 {\n[[card {\nOne\n}]]\n}]]"));

    expect(out).toContain("gap:32px");
    expect(out).toContain('class="mc-cards mc-cards--2"');
  });
});

describe("nesting", () => {
  it("follows cards down to the limit", async () => {
    const out = await renderPortal(nestedCards(MAX_CARD_DEPTH, "the middle"));

    expect(out.match(/<div class="mc-card">/g)).toHaveLength(MAX_CARD_DEPTH);
    expect(out).toContain("the middle");
  });

  it("stops at the limit and leaves the deeper source as text", async () => {
    const out = await renderPortal(nestedCards(MAX_CARD_DEPTH + 1, "too deep"));

    // The cards up to the limit render; the one past it appears as what was
    // typed, so whoever wrote it can see where the nesting stopped.
    expect(out.match(/<div class="mc-card">/g)).toHaveLength(MAX_CARD_DEPTH);
    expect(out).toContain("[[card {");
    expect(out).toContain("too deep");
  });

  it("counts each document from nothing, so one deep page does not shorten the next", async () => {
    await renderPortal(nestedCards(MAX_CARD_DEPTH + 1, "first"));
    const out = await renderPortal(nestedCards(MAX_CARD_DEPTH, "second"));

    expect(out.match(/<div class="mc-card">/g)).toHaveLength(MAX_CARD_DEPTH);
  });
});
