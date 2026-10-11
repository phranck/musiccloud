import { ContentContext, PLANS_PLACEHOLDER_ATTRIBUTE, PLANS_SHORTCODE } from "@musiccloud/shared";
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
  it("takes nothing, because everything a plan shows lives on the plan", () => {
    expect(PLANS_SHORTCODE.params).toEqual([]);
  });

  it("leaves a placeholder for the portal to fill", async () => {
    expect(await renderPortal("[[plans]]")).toContain(`<div ${PLANS_PLACEHOLDER_ATTRIBUTE}></div>`);
  });

  it("holds no plan of its own, since the plans are read where the page is served", async () => {
    // Empty on purpose: anything inside would be shown until the portal
    // replaced it, and a plan list that flashes something else first is worse
    // than one that simply appears.
    expect(await renderPortal("[[plans]]")).toMatch(new RegExp(`${PLANS_PLACEHOLDER_ATTRIBUTE}></div>`));
  });

  it("survives the sanitizer", async () => {
    expect(await served("[[plans]]")).toContain(PLANS_PLACEHOLDER_ATTRIBUTE);
  });

  it("stands where it was written, among the rest of the page", async () => {
    const out = await served("Some copy.\n\n[[plans]]\n\nMore copy.");

    expect(out.indexOf("Some copy.")).toBeLessThan(out.indexOf(PLANS_PLACEHOLDER_ATTRIBUTE));
    expect(out.indexOf(PLANS_PLACEHOLDER_ATTRIBUTE)).toBeLessThan(out.indexOf("More copy."));
  });

  it("drops whatever a page writes after the token, since it configures nothing", async () => {
    const out = await served('[[plans heading="something" columns=9]]');

    // The marker survives and the attempt at configuring it does not reach the
    // page, so a writer sees the plans rather than their own attributes.
    expect(out).toContain(PLANS_PLACEHOLDER_ATTRIBUTE);
    expect(out).not.toContain("something");
    expect(out).not.toContain("columns");
  });

  it("is not offered on the site, which has no page that shows plans", async () => {
    await expect(renderMarkdown("[[plans]]", ContentContext.Frontend)).rejects.toThrow(
      /only allowed in Developer Portal/,
    );
  });
});
