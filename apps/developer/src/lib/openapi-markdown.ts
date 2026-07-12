/**
 * Safe Markdown rendering for OpenAPI prose.
 *
 * OpenAPI descriptions are authored as Markdown but must never become a raw
 * HTML injection surface. Marked escapes normal text; this renderer also
 * escapes explicit HTML tokens and restricts link protocols before the result
 * is passed to Astro's `set:html` directive.
 */
import { marked, Renderer } from "marked";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeHref(value: string): string | undefined {
  const href = value.trim();
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith("/") || href.startsWith("#")) return href;
  return undefined;
}

function createSafeRenderer(): Renderer {
  const renderer = new Renderer();

  // Explicit HTML in an API description is displayed as prose, never executed.
  renderer.html = ({ text }) => escapeHtml(text);
  renderer.link = ({ href, title, tokens }) => {
    const content = renderer.parser.parseInline(tokens);
    const safeLink = safeHref(href);
    if (!safeLink) return content;

    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a class="content-link text-fg" href="${escapeHtml(safeLink)}"${titleAttribute}>${content}</a>`;
  };
  renderer.image = ({ text, tokens }) => renderer.parser.parseInline(tokens ?? [{ type: "text", raw: text, text }]);

  return renderer;
}

/** Renders supported Markdown into sanitized HTML for OpenAPI descriptions. */
export function renderOpenApiMarkdown(markdown: string): string {
  return marked(markdown, { async: false, gfm: true, renderer: createSafeRenderer() });
}
