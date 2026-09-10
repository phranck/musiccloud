import { ContentContext, MAX_CONTAINER_DEPTH } from "@musiccloud/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { resetContainerDepth } from "../markdown/containers.js";
import { renderMarkdown } from "../markdown/renderer.js";
import { sanitizeMarkdownHtml } from "../markdown/sanitizer.js";

/** The stacks are portal shortcodes, so the portal context is what renders them. */
function renderPortal(markdown: string): Promise<string> {
  return renderMarkdown(markdown, ContentContext.DeveloperPortal);
}

/** Builds `depth` nested stacks around a marker, so a limit can be walked up to. */
function nestedStacks(depth: number, innermost: string): string {
  let markdown = innermost;
  for (let level = 0; level < depth; level += 1) markdown = `[[vstack {\n${markdown}\n}]]`;
  return markdown;
}

beforeEach(() => {
  resetContainerDepth();
});

describe("[[vstack]]", () => {
  it("stands its content one beneath the next", async () => {
    const out = await renderPortal("[[vstack {\nSome copy.\n}]]");

    expect(out).toContain('class="mc-stack mc-stack--column mc-stack--start"');
    expect(out).toContain("Some copy.");
  });

  it("renders its content as page content rather than as text", async () => {
    const out = await renderPortal("[[vstack {\n## A heading\n\nA paragraph with **weight**.\n}]]");

    expect(out).toMatch(/<h2[^>]*>A heading<\/h2>/);
    expect(out).toContain("<strong>weight</strong>");
  });

  it("takes the alignment the page named", async () => {
    const out = await renderPortal('[[vstack alignment="center" {\nCentred.\n}]]');

    expect(out).toContain("mc-stack--center");
  });

  it("leaves the gap to the stylesheet until a page names one", async () => {
    const without = await renderPortal("[[vstack {\nCopy.\n}]]");
    const with_ = await renderPortal("[[vstack spacing=12 {\nCopy.\n}]]");

    expect(without).not.toContain("style=");
    expect(with_).toContain('style="gap:12px"');
  });
});

describe("[[hstack]]", () => {
  it("stands its content side by side, halfway down by default", async () => {
    const out = await renderPortal("[[hstack {\nLeft.\n\nRight.\n}]]");

    expect(out).toContain('class="mc-stack mc-stack--row mc-stack--center"');
  });

  it("names the alignment as the stylesheet does, for either axis", async () => {
    // Leading and top are the same edge seen from the two directions, so one
    // set of names covers both and the stylesheet carries one set of rules.
    const out = await renderPortal('[[hstack alignment="firstTextBaseline" {\nCopy.\n}]]');

    expect(out).toContain("mc-stack--baseline");
  });

  it("reads that alignment however it is spelt", async () => {
    const out = await renderPortal('[[hstack alignment="first-text-baseline" {\nCopy.\n}]]');

    expect(out).toContain("mc-stack--baseline");
  });

  it("holds a stack of its own", async () => {
    const out = await renderPortal("[[hstack {\n[[vstack {\nInside.\n}]]\n}]]");

    expect(out).toContain("mc-stack--row");
    expect(out).toContain("mc-stack--column");
  });
});

describe("[[spacer]]", () => {
  it("takes whatever room is left when the page names no size", async () => {
    const out = await renderPortal("[[hstack {\nLeft.\n\n[[spacer]]\n\nRight.\n}]]");

    expect(out).toContain('class="mc-spacer mc-spacer--flexible"');
  });

  it("carries both measurements when the page names a size", async () => {
    // Which of the two applies depends on the stack around it, and the renderer
    // does not know that from where it stands.
    const out = await renderPortal("[[spacer size=24]]");

    expect(out).toContain('style="flex-basis:24px;height:24px"');
  });

  it("keeps that size through the sanitizer", async () => {
    const out = sanitizeMarkdownHtml(await renderPortal("[[spacer size=24]]"));

    expect(out).toContain("flex-basis:24px");
    expect(out).toContain("height:24px");
  });
});

describe("nesting", () => {
  it("stops at the shared limit rather than following a page without end", async () => {
    const out = await renderPortal(nestedStacks(MAX_CONTAINER_DEPTH + 1, "too deep"));

    expect(out.match(/mc-stack--column/g)).toHaveLength(MAX_CONTAINER_DEPTH);
    expect(out).toContain("[[vstack {");
  });

  it("counts a card and a stack against the same budget", async () => {
    // Two counters would let a document alternate between the two and reach
    // twice the depth either one allows.
    const out = await renderPortal("[[card {\n[[vstack {\nInside both.\n}]]\n}]]");

    expect(out).toContain('<div class="mc-card">');
    expect(out).toContain("mc-stack--column");
  });
});
