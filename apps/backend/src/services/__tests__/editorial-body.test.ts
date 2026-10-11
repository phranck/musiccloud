import { ContentContext } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";

// The figures come from a plan and a setting, none of which this test stands up.
vi.mock("../site-variables.js", () => ({
  resolveSiteVariableValues: async () => ({
    freeRequestsPerMinute: 60,
    freeRequestsPerDay: 10_000,
    projectsPerAccount: 3,
    registrationsPerProject: 5,
  }),
}));

const { renderMarkdown } = await import("../markdown/renderer.js");
const { renderEditorialBody } = await import("../editorial-body.js");

/**
 * Everything the site's content context can produce: each shortcode it allows,
 * a footnote, a task list, an aligned table, a code fence with a card modifier
 * and a language, and headings.
 */
const FRONTEND_CORPUS = [
  "# Title",
  "",
  "## Overview",
  "",
  "A paragraph with **weight**, a [link](https://musiccloud.io/about) and a footnote.[^note]",
  "",
  "[^note]: The note itself.",
  "",
  "Press {{Esc}} to close, or look for the [[pill:NEW tone=alert]] marker.",
  "",
  '[[icon name="key" text="A key"]]',
  "",
  "- [x] Done",
  "- [ ] Open",
  "",
  "| Left | Middle | Right |",
  "| :--- | :----: | ----: |",
  "| a | b | c |",
  "",
  "```ts recessed",
  "const answer = 42;",
  "```",
  "",
  "[[fields",
  '[[field label="Method" {',
  "`GET`",
  "}]]",
  '[[field label="Path" {',
  "`/api/v1/resolve`",
  "}]]",
  "]]",
  "",
  '[[image:/assets/console.png alt="The console" caption="Where it shows"]]',
  "",
  '[[pdf:/assets/terms.pdf title="Terms"]]',
  "",
  "[[youtube:dQw4w9WgXcQ]]",
  "",
  "[[vstack spacing=12 {",
  "Stacked copy.",
  "}]]",
  "",
  "[[hstack {",
  "Left.",
  "",
  "[[spacer]]",
  "",
  "Right.",
  "}]]",
].join("\n");

/**
 * Takes out the two differences the sanitizer is allowed to make: it drops the
 * footnote section's `data-footnotes`, which nothing on either surface reads,
 * and it rewrites a `style` without the closing semicolon, which says the same.
 */
function withoutHarmlessDifferences(html: string): string {
  return html.replace(/ data-footnotes(="")?/g, "").replace(/;"/g, '"');
}

describe("renderEditorialBody", () => {
  it("keeps everything the site's content context renders", async () => {
    const rendered = await renderMarkdown(FRONTEND_CORPUS, ContentContext.Frontend);
    const sanitized = await renderEditorialBody(FRONTEND_CORPUS, ContentContext.Frontend);

    // The sanitizer parses and reserializes, so both sides go through the same
    // serializer before they are compared.
    const { parseFragment, serialize } = await import("parse5");
    expect(withoutHarmlessDifferences(sanitized)).toBe(withoutHarmlessDifferences(serialize(parseFragment(rendered))));
    expect(rendered).toContain("<dt");
  });

  it("keeps a table column's alignment", async () => {
    const html = await renderEditorialBody("| Left | Right |\n| :--- | ----: |\n| a | b |", ContentContext.Frontend);

    expect(html).toContain('align="left"');
    expect(html).toContain('align="right"');
  });

  it("removes raw HTML that would run in the reader's browser", async () => {
    const html = await renderEditorialBody(
      '<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">\n\n<a href="javascript:alert(3)">click</a>',
      ContentContext.Frontend,
    );

    expect(html).not.toMatch(/<script|onerror|javascript:/i);
  });

  it("expands a site variable before the Markdown is parsed", async () => {
    expect(await renderEditorialBody("Up to {freeRequestsPerDay} a day.", ContentContext.Frontend)).toBe(
      "<p>Up to 10,000 a day.</p>\n",
    );
  });

  it("renders nothing for an empty body", async () => {
    expect(await renderEditorialBody(null, ContentContext.Frontend)).toBe("");
  });
});
