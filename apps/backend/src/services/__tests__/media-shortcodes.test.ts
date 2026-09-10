import { ContentContext } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../markdown/renderer.js";
import { sanitizeMarkdownHtml } from "../markdown/sanitizer.js";

/** The three are portal shortcodes, so the portal context is what renders them. */
function renderPortal(markdown: string): Promise<string> {
  return renderMarkdown(markdown, ContentContext.DeveloperPortal);
}

describe("[[image]]", () => {
  it("shows the picture the page named", async () => {
    const out = await renderPortal("[[image:/assets/console.png]]");

    expect(out).toContain('src="/assets/console.png"');
    expect(out).toContain('class="mc-figure"');
  });

  it("describes a picture by its caption when nothing else describes it", async () => {
    const out = await renderPortal('[[image:/assets/console.png caption="Your key, once"]]');

    expect(out).toContain('alt="Your key, once"');
    expect(out).toContain("Your key, once</figcaption>");
  });

  it("keeps its own alternative text when the page writes one", async () => {
    const out = await renderPortal('[[image:/assets/console.png alt="The console" caption="Your key, once"]]');

    expect(out).toContain('alt="The console"');
  });

  it("carries the size the page named", async () => {
    const out = await renderPortal("[[image:/assets/console.png width=640 height=360]]");

    expect(out).toContain('width="640"');
    expect(out).toContain('height="360"');
  });

  it("refuses an address that is neither this site nor https", async () => {
    const out = await renderPortal("[[image:javascript:alert(1)]]");

    expect(out).not.toContain("<img");
  });

  it("refuses an address that leaves the site through a protocol-relative one", async () => {
    // `//evil.example` is a full address wearing the clothes of a path.
    const out = await renderPortal("[[image://evil.example/x.png]]");

    expect(out).not.toContain("<img");
  });
});

describe("[[pdf]]", () => {
  it("links the file as a card rather than as a bare link", async () => {
    const out = await renderPortal("[[pdf:/assets/terms.pdf]]");

    expect(out).toContain('class="mc-pdf"');
    expect(out).toContain('href="/assets/terms.pdf"');
  });

  it("falls back to the file's own name for a heading", async () => {
    const out = await renderPortal("[[pdf:/assets/terms.pdf]]");

    expect(out).toContain("terms.pdf");
  });

  it("takes the heading and the label the page wrote", async () => {
    const out = await renderPortal('[[pdf:/assets/terms.pdf title="Terms of use" label="Read them"]]');

    expect(out).toContain("Terms of use");
    expect(out).toContain("Read them");
  });
});

describe("[[youtube]]", () => {
  it("reads the identifier out of a watch address", async () => {
    const out = await renderPortal("[[youtube:https://www.youtube.com/watch?v=dQw4w9WgXcQ]]");

    expect(out).toContain("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("reads it out of a short address too", async () => {
    const out = await renderPortal("[[youtube:https://youtu.be/dQw4w9WgXcQ]]");

    expect(out).toContain("/embed/dQw4w9WgXcQ");
  });

  it("takes the identifier on its own", async () => {
    const out = await renderPortal("[[youtube:dQw4w9WgXcQ]]");

    expect(out).toContain("/embed/dQw4w9WgXcQ");
  });

  it("loads from the host this code names, whatever the page wrote", async () => {
    // Nothing a page writes decides where the video comes from.
    const out = await renderPortal("[[youtube:https://evil.example/watch?v=dQw4w9WgXcQ]]");

    expect(out).toContain("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(out).not.toContain("evil.example");
  });

  it("renders nothing where there is no identifier to find", async () => {
    const out = await renderPortal("[[youtube:https://evil.example/]]");

    expect(out).not.toContain("mc-video");
  });

  it("is widescreen until the page names another shape", async () => {
    const widescreen = await renderPortal("[[youtube:dQw4w9WgXcQ]]");
    const square = await renderPortal('[[youtube:dQw4w9WgXcQ aspect="1:1"]]');

    expect(widescreen).toContain("aspect-ratio:16 / 9");
    expect(square).toContain("aspect-ratio:1 / 1");
  });

  it("keeps that shape through the sanitizer", async () => {
    const out = sanitizeMarkdownHtml(await renderPortal("[[youtube:dQw4w9WgXcQ]]"));

    expect(out).toContain("aspect-ratio:16 / 9");
    expect(out).toContain("/embed/dQw4w9WgXcQ");
  });
});
