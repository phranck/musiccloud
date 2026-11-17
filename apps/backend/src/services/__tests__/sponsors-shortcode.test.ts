import { ContentContext, parseSponsorWallAttribute, SPONSOR_WALL_ATTRIBUTE } from "@musiccloud/shared";
import { parseFragment } from "parse5";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../markdown/renderer.js";
import { sanitizeMarkdownHtml } from "../markdown/sanitizer.js";

/** What the page actually serves on the site, which is the render put through the sanitizer. */
async function served(markdown: string): Promise<string> {
  return sanitizeMarkdownHtml(await renderMarkdown(markdown, ContentContext.Frontend));
}

/**
 * Reads the wall's texts back from a served page, as the site does.
 *
 * @param html - The served page.
 * @returns The texts, or `null` when the page carries no wall.
 */
function wallOf(html: string) {
  const marker = parseFragment(html).childNodes.find(
    (node) => "attrs" in node && node.attrs.some((attribute) => attribute.name === SPONSOR_WALL_ATTRIBUTE),
  );
  const value =
    marker && "attrs" in marker
      ? marker.attrs.find((attribute) => attribute.name === SPONSOR_WALL_ATTRIBUTE)?.value
      : undefined;
  return value === undefined ? null : parseSponsorWallAttribute(value);
}

describe("[[sponsors]]", () => {
  it("leaves an empty marker with every text rendered as Markdown", async () => {
    const wall = wallOf(
      await served(
        '[[sponsors text="They **carry** this year." missing="Still {missing} to go." empty="**Your place.**\\n\\nA year on the page." emptyAction="Become the first"]]',
      ),
    );

    expect(wall).toEqual({
      text: "<p>They <strong>carry</strong> this year.</p>\n",
      covered: "",
      missing: "<p>Still {missing} to go.</p>\n",
      empty: "<p><strong>Your place.</strong></p>\n<p>A year on the page.</p>\n",
      emptyAction: "Become the first",
    });
  });

  it("stands with empty texts when the page names none, so the site's defaults apply", async () => {
    expect(wallOf(await served("[[sponsors]]"))).toEqual({
      text: "",
      covered: "",
      missing: "",
      empty: "",
      emptyAction: "",
    });
  });

  it("stands where it was written, among the rest of the page", async () => {
    const out = await served("Some copy.\n\n[[sponsors]]\n\nMore copy.");

    expect(out.indexOf("Some copy.")).toBeLessThan(out.indexOf(SPONSOR_WALL_ATTRIBUTE));
    expect(out.indexOf(SPONSOR_WALL_ATTRIBUTE)).toBeLessThan(out.indexOf("More copy."));
  });

  it("puts every text through the page's allowlist", async () => {
    const wall = wallOf(await served('[[sponsors text="<script>alert(1)</script><a href=\\"javascript:x\\">go</a>"]]'));

    expect(wall?.text).not.toContain("<script");
    expect(wall?.text).not.toContain("javascript:");
  });

  it("cleans a marker a page wrote by hand", async () => {
    const forged = JSON.stringify({ text: '<img src="javascript:x" onerror="alert(1)">', emptyAction: 7, extra: "x" });
    const wall = wallOf(sanitizeMarkdownHtml(`<div ${SPONSOR_WALL_ATTRIBUTE}='${forged}'></div>`));

    expect(wall?.text).not.toContain("onerror");
    expect(wall?.text).not.toContain("javascript:");
    expect(wall?.emptyAction).toBe("");
    expect(wall).not.toHaveProperty("extra");
  });

  it("is not offered in the developer portal, which has no support page", async () => {
    await expect(renderMarkdown("[[sponsors]]", ContentContext.DeveloperPortal)).rejects.toThrow(/only allowed in/);
  });
});
