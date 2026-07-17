import { ContentContext, type ContentContextMask, type SingleContentContext } from "@musiccloud/shared";
import type { MarkedExtension } from "marked";
import { describe, expect, it } from "vitest";
import {
  createMarkdownExtensionRegistry,
  MARKDOWN_EXTENSION_DEFINITIONS,
  type MarkdownExtensionDefinition,
} from "../markdown/extension-registry.js";
import { getMarkdownRenderer, renderMarkdown } from "../markdown/renderer.js";
import { MarkdownContextError, validateMarkdownForContexts } from "../markdown/validation.js";

const tiersMarkedExtension: MarkedExtension = {
  extensions: [
    {
      name: "tiers",
      level: "block",
      start(source) {
        return source.match(/^:::tiers/m)?.index;
      },
      tokenizer(source) {
        const match = source.match(/^:::tiers\r?\n([\s\S]*?)\r?\n:::[ \t]*(?:\r?\n|$)/);
        if (!match) return;
        return { type: "tiers", raw: match[0], text: match[1] };
      },
      renderer(token) {
        return `<section data-test-extension="tiers">${token.text}</section>\n`;
      },
    },
  ],
};

const tiersDefinition: MarkdownExtensionDefinition = {
  name: "tiers",
  allowedContextMask: ContentContext.DeveloperPortal,
  createMarkedExtension: () => tiersMarkedExtension,
  tokenTypes: ["tiers"],
};

const testRegistry = createMarkdownExtensionRegistry([...MARKDOWN_EXTENSION_DEFINITIONS, tiersDefinition]);

describe("context-aware Markdown extension registry", () => {
  it("declares a valid availability mask for every production extension", () => {
    const both = ContentContext.Frontend | ContentContext.DeveloperPortal;

    expect(MARKDOWN_EXTENSION_DEFINITIONS.map(({ name }) => name)).toEqual([
      "footnotes",
      "codeFence",
      "mcFields",
      "mcPill",
      "mcKbd",
    ]);
    expect(MARKDOWN_EXTENSION_DEFINITIONS.every(({ allowedContextMask }) => allowedContextMask === both)).toBe(true);
  });

  it("rejects duplicate extension names and invalid availability masks", () => {
    expect(() => createMarkdownExtensionRegistry([tiersDefinition, tiersDefinition])).toThrow(
      "Duplicate Markdown extension: tiers",
    );
    expect(() =>
      createMarkdownExtensionRegistry([
        { ...tiersDefinition, name: "invalid", allowedContextMask: 0 as ContentContextMask },
      ]),
    ).toThrow("Invalid context mask for Markdown extension invalid");
  });

  it("accepts a Developer Portal-only extension in its allowed context", () => {
    expect(
      validateMarkdownForContexts(":::tiers\nsecret plan names\n:::", ContentContext.DeveloperPortal, testRegistry),
    ).toEqual({ ok: true, errors: [] });
  });

  it("rejects a Developer Portal-only extension for frontend and shared pages", () => {
    const markdown = ":::tiers\nsecret plan names\n:::";

    expect(validateMarkdownForContexts(markdown, ContentContext.Frontend, testRegistry)).toEqual({
      ok: false,
      errors: [{ extension: "tiers", allowedContextMask: ContentContext.DeveloperPortal }],
    });
    expect(
      validateMarkdownForContexts(markdown, ContentContext.Frontend | ContentContext.DeveloperPortal, testRegistry),
    ).toEqual({
      ok: false,
      errors: [{ extension: "tiers", allowedContextMask: ContentContext.DeveloperPortal }],
    });
  });

  it("does not include page content in extension validation errors", () => {
    const unpublishedContent = "private draft content";
    const result = validateMarkdownForContexts(
      `:::tiers\n${unpublishedContent}\n:::`,
      ContentContext.Frontend,
      testRegistry,
    );

    expect(JSON.stringify(result)).not.toContain(unpublishedContent);
  });

  it("does not treat extension syntax inside a fenced code example as usage", () => {
    const markdown = "```text\n:::tiers\nexample only\n:::\n```";

    expect(validateMarkdownForContexts(markdown, ContentContext.Frontend, testRegistry)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("keeps stateful extensions isolated between validation and rendering", async () => {
    const markdown = "Text with a footnote[^note].\n\n[^note]: Footnote body.";

    await expect(renderMarkdown(markdown, ContentContext.Frontend)).resolves.toContain(
      '<section class="footnotes" data-footnotes>',
    );
  });

  it("serializes concurrent renders that share one stateful context renderer", async () => {
    const [first, second] = await Promise.all([
      renderMarkdown("Alpha[^a].\n\n[^a]: First.", ContentContext.Frontend),
      renderMarkdown("Beta[^b].\n\n[^b]: Second.", ContentContext.Frontend),
    ]);

    expect(first).toContain('id="footnote-a"');
    expect(second).toContain('id="footnote-b"');
    expect(first).not.toContain("<pre>Alpha");
    expect(second).not.toContain("<pre>Beta");
  });

  it("rejects zero and unknown context bits during backend validation", () => {
    expect(() => validateMarkdownForContexts("plain", 0, testRegistry)).toThrow("Invalid content context mask");
    expect(() => validateMarkdownForContexts("plain", 4, testRegistry)).toThrow("Invalid content context mask");
    expect(() => validateMarkdownForContexts("plain", 2 ** 32, testRegistry)).toThrow("Invalid content context mask");
  });

  it("renders a registered extension only in its allowed concrete context", async () => {
    const markdown = ":::tiers\nDeveloper plans\n:::";

    await expect(renderMarkdown(markdown, ContentContext.Frontend, testRegistry)).rejects.toEqual(
      expect.objectContaining({
        name: "MarkdownContextError",
        errors: [{ extension: "tiers", allowedContextMask: ContentContext.DeveloperPortal }],
      }),
    );
    await expect(renderMarkdown(markdown, ContentContext.DeveloperPortal, testRegistry)).resolves.toContain(
      '<section data-test-extension="tiers">Developer plans</section>',
    );
  });

  it("caches one renderer per concrete context and registry", () => {
    expect(getMarkdownRenderer(ContentContext.Frontend, testRegistry)).toBe(
      getMarkdownRenderer(ContentContext.Frontend, testRegistry),
    );
    expect(getMarkdownRenderer(ContentContext.Frontend, testRegistry)).not.toBe(
      getMarkdownRenderer(ContentContext.DeveloperPortal, testRegistry),
    );
  });

  it("requires rendering to use one concrete context", () => {
    expect(() =>
      getMarkdownRenderer(
        (ContentContext.Frontend | ContentContext.DeveloperPortal) as SingleContentContext,
        testRegistry,
      ),
    ).toThrow("Markdown rendering requires one concrete content context");
  });

  it("exposes a safe error message with extension and allowed contexts", () => {
    const error = new MarkdownContextError([
      { extension: "tiers", allowedContextMask: ContentContext.DeveloperPortal },
    ]);

    expect(error.message).toBe('Markdown extension "tiers" is only allowed in Developer Portal');
  });
});
