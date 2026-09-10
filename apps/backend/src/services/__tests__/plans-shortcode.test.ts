import {
  ContentContext,
  PLANS_DEFAULT_HEADING,
  PLANS_MAX_HEADING_LENGTH,
  PLANS_PLACEHOLDER_ATTRIBUTE,
} from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../markdown/renderer.js";
import { sanitizeMarkdownHtml } from "../markdown/sanitizer.js";

/** Plans are a portal shortcode, so the portal context is what renders them. */
function renderPortal(markdown: string): Promise<string> {
  return renderMarkdown(markdown, ContentContext.DeveloperPortal);
}

/** What the page actually serves, which is the render put through the sanitizer. */
async function served(markdown: string): Promise<string> {
  return sanitizeMarkdownHtml(await renderPortal(markdown));
}

describe("[[plans]]", () => {
  it("leaves a placeholder for the portal to fill", async () => {
    const out = await renderPortal("[[plans]]");

    expect(out).toContain(`<div ${PLANS_PLACEHOLDER_ATTRIBUTE}="${PLANS_DEFAULT_HEADING}"></div>`);
  });

  it("holds no plan of its own, since the plans are read where the page is served", async () => {
    const out = await renderPortal("[[plans]]");

    // Empty on purpose: anything inside would be shown until the portal
    // replaced it, and a plan list that flashes something else first is worse
    // than one that simply appears.
    expect(out).toMatch(new RegExp(`${PLANS_PLACEHOLDER_ATTRIBUTE}="[^"]*"></div>`));
  });

  it("carries the heading a page asks for", async () => {
    const out = await renderPortal('[[plans heading="What each plan gives you"]]');

    expect(out).toContain(`${PLANS_PLACEHOLDER_ATTRIBUTE}="What each plan gives you"`);
  });

  it("survives the sanitizer", async () => {
    expect(await served("[[plans]]")).toContain(`${PLANS_PLACEHOLDER_ATTRIBUTE}="${PLANS_DEFAULT_HEADING}"`);
  });

  it("stands where it was written, among the rest of the page", async () => {
    const out = await served("Some copy.\n\n[[plans]]\n\nMore copy.");

    expect(out.indexOf("Some copy.")).toBeLessThan(out.indexOf(PLANS_PLACEHOLDER_ATTRIBUTE));
    expect(out.indexOf(PLANS_PLACEHOLDER_ATTRIBUTE)).toBeLessThan(out.indexOf("More copy."));
  });

  it("is not offered on the site, which has no page that shows plans", async () => {
    await expect(renderMarkdown("[[plans]]", ContentContext.Frontend)).rejects.toThrow(
      /only allowed in Developer Portal/,
    );
  });
});

describe("the plans heading is untrusted", () => {
  it("keeps markup out of the attribute", async () => {
    const out = await served('[[plans heading="a \\"><script>alert(1)</script>"]]');

    expect(out).not.toContain("<script>");
    expect(out).not.toContain("alert(1)");
  });

  it("drops a heading longer than a heading needs to be", async () => {
    const out = await served(`[[plans heading="${"a".repeat(PLANS_MAX_HEADING_LENGTH + 1)}"]]`);

    // The attribute goes rather than the element, so the portal renders the
    // plans under their own default heading instead of not at all.
    expect(out).toContain("<div></div>");
    expect(out).not.toContain(PLANS_PLACEHOLDER_ATTRIBUTE);
  });

  it("keeps a heading exactly at the limit", async () => {
    const heading = "a".repeat(PLANS_MAX_HEADING_LENGTH);
    const out = await served(`[[plans heading="${heading}"]]`);

    expect(out).toContain(`${PLANS_PLACEHOLDER_ATTRIBUTE}="${heading}"`);
  });
});
