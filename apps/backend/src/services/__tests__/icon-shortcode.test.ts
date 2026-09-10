import { ContentContext, ICON_DEFAULT_SIZE } from "@musiccloud/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { resetIconCache } from "../markdown/icon-sets.js";
import { renderMarkdown } from "../markdown/renderer.js";
import { sanitizeMarkdownHtml } from "../markdown/sanitizer.js";

/**
 * The site's context, because these name Phosphor icons and the site is what
 * Phosphor is drawn for. The portal draws the same shortcode in Iconsax, which
 * has its own test below.
 */
function renderPortal(markdown: string): Promise<string> {
  return renderMarkdown(markdown, ContentContext.Frontend);
}

beforeEach(() => {
  resetIconCache();
});

describe("[[icon]]", () => {
  it("draws the symbol in its duotone weight", async () => {
    const out = await renderPortal('[[icon name="key"]]');

    // Two shapes, one of them at the lighter tone. That is what duotone is.
    expect(out.match(/<path /g)).toHaveLength(2);
    expect(out).toContain('opacity="0.2"');
    expect(out).toContain('viewBox="0 0 256 256"');
  });

  it("takes the size the registry declares until a page names one", async () => {
    const declared = await renderPortal('[[icon name="key"]]');
    const named = await renderPortal('[[icon name="key" size=96]]');

    expect(declared).toContain(`width="${ICON_DEFAULT_SIZE}"`);
    expect(named).toContain('width="96"');
  });

  it("inherits the colour of the text until a page names one", async () => {
    const inherited = await renderPortal('[[icon name="key"]]');
    const named = await renderPortal('[[icon name="key" color="cea836"]]');

    expect(inherited).toContain('fill="currentColor"');
    // A bare hex figure gets its hash, so both spellings mean the same thing.
    expect(named).toContain('fill="#cea836"');
  });

  it("refuses a colour that is none of the three forms", async () => {
    // A value reaching `fill` unread can point at a paint server elsewhere in
    // the document instead of naming a colour.
    const out = await renderPortal('[[icon name="key" color="url(#gradient)"]]');

    expect(out).toContain('fill="currentColor"');
  });

  it("leaves the shortcode standing when the name leads nowhere", async () => {
    const out = await renderPortal('[[icon name="not-an-icon-at-all"]]');

    expect(out).not.toContain("<svg");
    expect(out).toContain("[[icon");
  });

  it("refuses a name that is a path rather than an icon", async () => {
    const out = await renderPortal('[[icon name="../../../etc/passwd"]]');

    expect(out).not.toContain("<svg");
  });

  it("sets the text beside the symbol, and the symbol before it", async () => {
    const out = await renderPortal('[[icon name="key" text="One key, every service"]]');

    expect(out).toContain("mc-icon-pair--row");
    expect(out).toContain("One key, every service");
  });

  it("puts the text on the left when the page asks for leading", async () => {
    const out = await renderPortal('[[icon name="key" text="Beside it" textalignment="leading"]]');

    expect(out).toContain("mc-icon-pair--row-reverse");
  });

  it("reads a SwiftUI alignment with its leading dot", async () => {
    const out = await renderPortal('[[icon name="key" text="Beside it" textalignment=".topLeading"]]');

    expect(out).toContain("mc-icon-pair--start");
  });

  it("keeps a text of a few words inside the line the symbol sits on", async () => {
    const out = await renderPortal('[[icon name="key" text="A few words"]]');

    expect(out).toContain('<span class="mc-icon-pair mc-icon-pair--row">');
    expect(out).not.toContain('<div class="mc-icon-pair');
  });

  it("gives a text carrying a heading a block of its own", async () => {
    // A heading is not permitted inside a `span`, and a browser meeting one
    // breaks the surrounding paragraph open to fix it.
    const out = await renderPortal('[[icon name="key" text="## One key"]]');

    expect(out).toContain('<div class="mc-icon-pair');
    expect(out).toMatch(/<h2[^>]*>One key<\/h2>/);
  });

  it("floats the symbol when an alignment names a side and no text stands beside it", async () => {
    const out = await renderPortal('[[icon name="key" textalignment="trailing"]]\n\nA paragraph beside it.');

    expect(out).toContain("mc-icon--float-start");
  });

  it("places the symbol itself where alignment says, which is not where the text goes", async () => {
    const out = await renderPortal('[[icon name="key" alignment="center"]]');

    expect(out).toContain("mc-icon--align-center");
  });

  it("leaves the gap between symbol and text to the stylesheet until a page names one", async () => {
    const without = await renderPortal('[[icon name="key" text="Beside it"]]');
    const named = await renderPortal('[[icon name="key" text="Beside it" spacing=16]]');

    expect(without).not.toContain("style=");
    expect(named).toContain('style="gap:16px"');
  });

  it("keeps that gap through the sanitizer", async () => {
    const out = sanitizeMarkdownHtml(await renderPortal('[[icon name="key" text="Beside it" spacing=16]]'));

    expect(out).toContain("gap:16px");
  });

  it("draws the portal in its own hand, and the site in the other", async () => {
    // Iconsax for the portal, Phosphor for the site. Each set publishes its own
    // names, so a name one knows the other has no word for.
    const portal = await renderMarkdown('[[icon name="profile-circle"]]', ContentContext.DeveloperPortal);
    const site = await renderMarkdown('[[icon name="user-circle"]]', ContentContext.Frontend);

    expect(portal).toContain('viewBox="0 0 24 24"');
    expect(site).toContain('viewBox="0 0 256 256"');
  });

  it("leaves a name the surface's own set has no word for standing as text", async () => {
    const out = await renderMarkdown('[[icon name="user-circle"]]', ContentContext.DeveloperPortal);

    expect(out).not.toContain("<svg");
    expect(out).toContain("[[icon");
  });

  it("survives the sanitizer whole", async () => {
    const out = sanitizeMarkdownHtml(await renderPortal('[[icon name="key" size=96]]'));

    expect(out).toContain("<svg");
    expect(out).toContain('viewBox="0 0 256 256"');
    expect(out.match(/<path /g)).toHaveLength(2);
  });
});
