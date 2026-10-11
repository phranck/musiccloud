import { ContentContext } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { headingId } from "../markdown/heading-anchors.js";
import { renderMarkdown } from "../markdown/renderer.js";

function render(markdown: string): Promise<string> {
  return renderMarkdown(markdown, ContentContext.Frontend);
}

describe("headingId", () => {
  it("joins the words of a heading with hyphens", () => {
    expect(headingId("How it fits together")).toBe("how-it-fits-together");
  });

  it("drops punctuation rather than encoding it", () => {
    expect(headingId("What's next? (probably)")).toBe("what-s-next-probably");
  });

  it("keeps the letter a combining mark sat on", () => {
    expect(headingId("Übersicht")).toBe("ubersicht");
  });

  it("prefixes a heading that begins with a digit, since an id may not", () => {
    expect(headingId("2 minutes to your first call")).toBe("section-2-minutes-to-your-first-call");
  });

  it("returns nothing for a heading with no letters or digits", () => {
    expect(headingId("···")).toBe("");
  });
});

describe("heading anchors in a rendered page", () => {
  it("gives a heading an id taken from its own words", async () => {
    expect(await render("## How it fits together")).toContain('<h2 id="how-it-fits-together">');
  });

  it("gives every level an id", async () => {
    const html = await render("# One\n\n## Two\n\n### Three");

    expect(html).toContain('<h1 id="one">');
    expect(html).toContain('<h2 id="two">');
    expect(html).toContain('<h3 id="three">');
  });

  it("takes the words rather than the markup inside a heading", async () => {
    expect(await render("## A **bold** heading")).toContain('id="a-bold-heading"');
  });

  it("numbers a repeated heading, so no two elements share an id", async () => {
    const html = await render("## Overview\n\nSome copy.\n\n## Overview");

    expect(html).toContain('<h2 id="overview">');
    expect(html).toContain('<h2 id="overview-2">');
  });

  it("starts the numbering over for each page", async () => {
    // Otherwise a link written against one page's `#overview` would miss on the
    // next render, which is the failure this is here to prevent.
    await render("## Overview");
    expect(await render("## Overview")).toContain('<h2 id="overview">');
  });

  it("emits no id where a heading yields none", async () => {
    expect(await render("## ···")).toContain("<h2>");
  });
});
