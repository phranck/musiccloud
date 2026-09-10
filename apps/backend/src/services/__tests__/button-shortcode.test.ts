import { ContentContext } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../markdown/renderer.js";
import { sanitizeMarkdownHtml } from "../markdown/sanitizer.js";

/** The button is a portal shortcode, so the portal context is what renders it. */
function renderPortal(markdown: string): Promise<string> {
  return renderMarkdown(markdown, ContentContext.DeveloperPortal);
}

describe("[[button]]", () => {
  it("renders a command that goes where its target says", async () => {
    const out = await renderPortal('[[button action="/signup" label="Get an API key"]]');

    expect(out).toContain('href="/signup"');
    expect(out).toContain("Get an API key");
    expect(out).toContain("mc-button");
  });

  it("takes the accent treatment until a page asks for the other", async () => {
    const accent = await renderPortal('[[button action="/signup" label="Go"]]');
    const neutral = await renderPortal('[[button action="/docs" label="Read" tone="neutral"]]');

    expect(accent).toContain("button--content");
    expect(neutral).toContain("button--secondary");
  });

  it("draws the symbol a page names, in the label's own colour", async () => {
    const out = await renderPortal('[[button action="/signup" label="Get an API key" icon="key"]]');

    expect(out).toContain('class="mc-button__icon"');
    expect(out).toContain('fill="currentColor"');
  });

  it("renders the label alone where the page names no symbol", async () => {
    const out = await renderPortal('[[button action="/signup" label="Get an API key"]]');

    expect(out).not.toContain("<svg");
  });

  it("leaves a command with nowhere to go as text", async () => {
    const out = await renderPortal('[[button label="Nowhere"]]');

    expect(out).not.toContain("mc-button");
    expect(out).toContain("[[button");
  });

  it("leaves a command with no words on it as text", async () => {
    const out = await renderPortal('[[button action="/signup"]]');

    expect(out).not.toContain("mc-button");
    expect(out).toContain("[[button");
  });

  it("refuses an address a reader could not follow", async () => {
    const out = await renderPortal('[[button action="javascript:alert(1)" label="Press"]]');

    expect(out).not.toContain("mc-button");
  });

  it("refuses one that leaves the site through a protocol-relative address", async () => {
    // `//evil.example` is a full address wearing the clothes of a path.
    const out = await renderPortal('[[button action="//evil.example" label="Press"]]');

    expect(out).not.toContain("mc-button");
  });

  it("stands beside another when each is its own paragraph in a row", async () => {
    const out = await renderPortal(
      '[[hstack spacing=12 {\n[[button action="/signup" label="One"]]\n\n[[button action="/docs" label="Two" tone="neutral"]]\n}]]',
    );

    expect(out).toContain('style="gap:12px"');
    expect(out.match(/mc-button/g)).toHaveLength(2);
  });

  it("survives the sanitizer whole", async () => {
    const out = sanitizeMarkdownHtml(
      await renderPortal('[[button action="/signup" label="Get an API key" icon="key"]]'),
    );

    expect(out).toContain('href="/signup"');
    expect(out).toContain("button--content");
    expect(out).toContain("<svg");
  });
});
